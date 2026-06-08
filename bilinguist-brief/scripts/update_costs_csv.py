import json
import sys
import csv
import os

costs_path, csv_path = sys.argv[1], sys.argv[2]
with open(costs_path) as f:
    c = json.load(f)
s = c.get("stages", {})
header = [
    "date", "total_calls", "input_tokens", "output_tokens", "thinking_tokens",
    "total_usd", "total_gbp", "gather_usd", "stage_2s_usd", "stage_2m_usd",
    "stage_3_usd", "stage_4_usd",
]
row = [
    c["date"],
    sum(s[st].get("calls", 0) for st in s),
    sum(s[st].get("input_tokens", 0) for st in s),
    sum(s[st].get("output_tokens", 0) for st in s),
    sum(s[st].get("thinking_tokens", 0) for st in s),
    c["total_usd"], c["total_gbp"],
    s.get("1_gather", {}).get("cost_usd", 0),
    s.get("2S", {}).get("cost_usd", 0),
    s.get("2M", {}).get("cost_usd", 0),
    s.get("3", {}).get("cost_usd", 0),
    s.get("4", {}).get("cost_usd", 0),
]
write_header = not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0
with open(csv_path, "a", newline="") as f:
    w = csv.writer(f)
    if write_header:
        w.writerow(header)
    w.writerow(row)
print(f"Cost row appended: ${c['total_usd']:.4f} / £{c['total_gbp']:.4f}")
