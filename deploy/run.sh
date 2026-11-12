#!/bin/bash
# Lambda entry point: the Lambda Web Adapter layer forwards HTTP requests to this server.
mkdir -p /tmp/cache
exec node server.js
