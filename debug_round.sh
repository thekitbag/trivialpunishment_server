#!/bin/bash

pkill -9 -f "node" 2>/dev/null
sleep 1

node server.js > /tmp/round_test.log 2>&1 &
sleep 2

node test_round_lifecycle.js > /tmp/client_output.log 2>&1 &
sleep 25

echo "=== Checking for round_over events ==="
grep "round_over" /tmp/round_test.log | head -5

echo ""
echo "=== Checking ROUND_OVER state transitions ==="
grep "ROUND_OVER" /tmp/round_test.log | head -5

pkill -9 -f "node" 2>/dev/null
