#!/usr/bin/env bash
# Removes everything deploy.sh created: the function, its URL, its log group and its IAM role.
set -uo pipefail
export AWS_PAGER=""
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-southeast-1}}"
export AWS_DEFAULT_REGION="$REGION"
FN="${FN:-homefit-sg-demo}"
ROLE="${FN}-role"

read -r -p "Delete Lambda function $FN, its public URL, logs and role $ROLE in $REGION? [y/N] " ans
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || exit 0

aws lambda delete-function-url-config --function-name "$FN" >/dev/null 2>&1 && echo "deleted function URL"
aws lambda delete-function --function-name "$FN" >/dev/null 2>&1 && echo "deleted function $FN"
aws logs delete-log-group --log-group-name "/aws/lambda/$FN" >/dev/null 2>&1 && echo "deleted logs"
aws iam detach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null 2>&1
aws iam delete-role --role-name "$ROLE" >/dev/null 2>&1 && echo "deleted role $ROLE"
echo "done"
