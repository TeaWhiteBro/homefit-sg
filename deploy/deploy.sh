#!/usr/bin/env bash
# Deploys the HomeFit SG demo to AWS Lambda with a public HTTPS function URL.
#
# Run it in AWS CloudShell from the repository root, after building the package:
#     bash deploy/build-lambda.sh && bash deploy/deploy.sh
# Running it again updates the same function (code, settings, key) and keeps the URL.
#
# What it creates (all named homefit-sg-demo*):
#   - IAM role homefit-sg-demo-role (lets Lambda write its logs, nothing else)
#   - Lambda function homefit-sg-demo (Node.js 22, 1 GB, Lambda Web Adapter layer)
#   - a public function URL (https://....lambda-url.<region>.on.aws/)
# No server runs when nobody uses the site, so idle cost is zero.
set -euo pipefail
cd "$(dirname "$0")"
export AWS_PAGER=""

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-southeast-1}}"
export AWS_DEFAULT_REGION="$REGION"
FN="${FN:-homefit-sg-demo}"
ROLE="${FN}-role"
LWA_ACCOUNT="${LWA_ACCOUNT:-753240598075}"   # publisher of the AWS Lambda Web Adapter layer

# Model settings. A redeploy keeps what the live function already uses; a first deploy uses
# these defaults. To change one, set it when running the script, for example:
#     LLM_MODEL=MiniMax-M3 LLM_EXTRA_BODY='{}' bash deploy/deploy.sh
# (reasoning_effort only works with MiniMax-M3.1-Flash, so clear it when switching model.)
DEFAULT_LLM_BASE_URL="https://api.minimaxi.com/v1"   # MiniMax OpenAI-compatible endpoint
DEFAULT_LLM_MODEL="MiniMax-M3.1-Flash"
DEFAULT_LLM_EXTRA_BODY='{"reasoning_effort":"low"}'   # less thinking: faster replies that fit the budget
DEFAULT_LLM_MAX_TOKENS="4000"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f lambda.zip ] || die "deploy/lambda.zip not found; run: bash deploy/build-lambda.sh"
command -v aws >/dev/null || die "AWS CLI not found (run this in AWS CloudShell)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"

log "Account and region"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
echo "account $ACCOUNT, region $REGION, function $FN"

EXISTS=0
CURRENT="$TMP/current.json"
echo '{}' > "$CURRENT"
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  EXISTS=1
  aws lambda get-function-configuration --function-name "$FN" \
    --query 'Environment.Variables' --output json > "$CURRENT" 2>/dev/null || echo '{}' > "$CURRENT"
fi

log "AI key"
if [ -z "${LLM_API_KEY:-}" ]; then
  echo "Paste the LLM_API_KEY and press Enter. What you paste stays hidden."
  if [ "$EXISTS" = 1 ]; then
    echo "Press Enter on an empty line to keep the key the site already uses."
  else
    echo "Press Enter on an empty line to deploy without AI (the page opens, chat says AI is not connected)."
  fi
  read -rsp "LLM_API_KEY: " LLM_API_KEY
  echo
fi

# Environment for the function, written to a private temp file (the key never appears in
# the command line or the terminal). Order for each setting: value given when running this
# script > value the live function uses > default above.
ENVFILE="$TMP/env.json"
LLM_API_KEY="$LLM_API_KEY" \
D_BASE="$DEFAULT_LLM_BASE_URL" D_MODEL="$DEFAULT_LLM_MODEL" \
D_EXTRA="$DEFAULT_LLM_EXTRA_BODY" D_MAX="$DEFAULT_LLM_MAX_TOKENS" \
python3 - "$CURRENT" "$ENVFILE" <<'PY'
import json, os, sys
cur = json.load(open(sys.argv[1])) or {}
defaults = {"LLM_BASE_URL": os.environ["D_BASE"], "LLM_MODEL": os.environ["D_MODEL"],
            "LLM_EXTRA_BODY": os.environ["D_EXTRA"], "LLM_MAX_TOKENS": os.environ["D_MAX"]}
v = {
    "AWS_LAMBDA_EXEC_WRAPPER": "/opt/bootstrap",     # start the web adapter
    "AWS_LWA_PORT": "3000",
    "PORT": "3000",
    "AWS_LWA_READINESS_CHECK_PATH": "/api/health",
    "NODE_ENV": "production",
    "NEXT_TELEMETRY_DISABLED": "1",
}
for name in ("LLM_BASE_URL", "LLM_MODEL"):
    v[name] = os.environ.get(name) or cur.get(name) or defaults[name]
# The extra fields are MiniMax-specific; other providers get the app's own request.
minimax = "minimax" in v["LLM_BASE_URL"]
for name in ("LLM_EXTRA_BODY", "LLM_MAX_TOKENS"):
    value = os.environ.get(name) or cur.get(name) or (defaults[name] if minimax else "")
    if value:
        v[name] = value
json.loads(v.get("LLM_EXTRA_BODY", "{}"))   # fail here, not in the app, if it is not valid JSON
key = os.environ.get("LLM_API_KEY") or cur.get("LLM_API_KEY") or ""
if key:
    v["LLM_API_KEY"] = key
with open(sys.argv[2], "w") as f:
    json.dump({"Variables": v}, f)
key_state = ("new key" if os.environ.get("LLM_API_KEY") else "keeping the existing key") if key else "no key"
print(f"model {v['LLM_MODEL']} at {v['LLM_BASE_URL']}")
print(f"extra request fields {v.get('LLM_EXTRA_BODY', '-')}, max tokens {v.get('LLM_MAX_TOKENS', 'app default')}, {key_state}")
if not key:
    print("WARNING: no key set: chat will be unavailable until you run this again with a key", file=sys.stderr)
PY

log "Lambda Web Adapter layer"
LAYER=""
for v in $(seq 30 -1 20); do
  arn="arn:aws:lambda:$REGION:$LWA_ACCOUNT:layer:LambdaAdapterLayerX86:$v"
  if aws lambda get-layer-version-by-arn --arn "$arn" >/dev/null 2>&1; then LAYER="$arn"; break; fi
done
if [ -z "$LAYER" ]; then
  LAYER="arn:aws:lambda:$REGION:$LWA_ACCOUNT:layer:LambdaAdapterLayerX86:30"
  warn "could not look up the layer (no permission to list it?); using $LAYER"
fi
echo "$LAYER"

log "IAM role $ROLE"
if ROLE_ARN="$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text 2>/dev/null)"; then
  echo "exists: $ROLE_ARN"
else
  ROLE_ARN="$(aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --tags Key=project,Value=cs5224-homefit \
    --query Role.Arn --output text)"
  echo "created: $ROLE_ARN"
fi
aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

SETTINGS=(--handler run.sh --runtime nodejs22.x --memory-size 1024 --timeout 90
          --layers "$LAYER" --environment "file://$ENVFILE")
if [ "$EXISTS" = 1 ]; then
  log "Updating function $FN"
  aws lambda update-function-code --function-name "$FN" --zip-file fileb://lambda.zip >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" --role "$ROLE_ARN" "${SETTINGS[@]}" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FN"
else
  log "Creating function $FN"
  created=0
  for i in $(seq 1 12); do   # a new role takes a few seconds before Lambda can use it
    if aws lambda create-function --function-name "$FN" --role "$ROLE_ARN" \
         --zip-file fileb://lambda.zip --architectures x86_64 "${SETTINGS[@]}" \
         --tags project=cs5224-homefit >/dev/null 2>"$TMP/err"; then
      created=1; break
    fi
    grep -q -i "cannot be assumed" "$TMP/err" || { cat "$TMP/err" >&2; die "create-function failed"; }
    echo "role not ready yet ($i/12), retrying in 5 s"; sleep 5
  done
  [ "$created" = 1 ] || die "Lambda could not use the new role; run deploy.sh again in a minute"
  aws lambda wait function-active-v2 --function-name "$FN"
fi
echo "function ready"

log "Public HTTPS URL"
if URL="$(aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text 2>/dev/null)"; then
  echo "exists"
else
  URL="$(aws lambda create-function-url-config --function-name "$FN" --auth-type NONE \
         --query FunctionUrl --output text)"
  echo "created"
fi
# statement ids already in the function's resource policy (empty when it has none)
SIDS=" $(aws lambda get-policy --function-name "$FN" --query Policy --output text 2>/dev/null \
  | python3 -c 'import json,sys; print(" ".join(s.get("Sid","") for s in json.load(sys.stdin)["Statement"]))' \
  2>/dev/null || true) "
if [[ "$SIDS" != *" public-url "* ]]; then
  aws lambda add-permission --function-name "$FN" --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
fi
if [[ "$SIDS" != *" public-url-invoke "* ]]; then
  aws lambda add-permission --function-name "$FN" --statement-id public-url-invoke \
    --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null
fi
echo "public access allowed"

log "Limits and logs"
# Cap parallel requests so a burst of traffic cannot run up AI or AWS costs.
if aws lambda put-function-concurrency --function-name "$FN" \
     --reserved-concurrent-executions 20 >/dev/null 2>&1; then
  echo "at most 20 requests at a time"
else
  echo "concurrency cap skipped (this account's Lambda limit is too low to reserve)"
fi
aws logs create-log-group --log-group-name "/aws/lambda/$FN" >/dev/null 2>&1 || true
aws logs put-retention-policy --log-group-name "/aws/lambda/$FN" --retention-in-days 7 >/dev/null 2>&1 \
  && echo "logs kept for 7 days" || true

log "Checking the site (the first request starts the app, ~5 s)"
ok=0
for i in $(seq 1 "${HEALTH_TRIES:-8}"); do
  if HEALTH="$(curl -fsS -m 40 "${URL%/}/api/health" 2>/dev/null)"; then ok=1; break; fi
  sleep 5
done
if [ "$ok" = 1 ]; then
  echo "$HEALTH"
else
  warn "health check did not answer yet; open the URL in a minute, or see the logs:"
  echo "  aws logs tail /aws/lambda/$FN --since 10m"
fi

cat <<DONE


HomeFit SG is live:
  $URL
Health:  ${URL%/}/api/health
Logs:    aws logs tail /aws/lambda/$FN --since 30m
Update:  bash deploy/build-lambda.sh && bash deploy/deploy.sh
Remove:  bash deploy/cleanup.sh
DONE
