#!/usr/bin/env python3
import json, time, urllib.request, sys
URL="http://127.0.0.1:9331/api/health"
last=None
for attempt in range(3):
    try:
        with urllib.request.urlopen(URL,timeout=3) as r:
            data=json.loads(r.read().decode())
            if r.status==200 and data.get("ok") is True and data.get("service")=="Salon OS":
                print("health_ok",data.get("version"),"jev="+str(data.get("jev")))
                raise SystemExit(0)
            last=f"bad_payload status={r.status}"
    except Exception as e:
        last=f"{type(e).__name__}: {e}"
    time.sleep(2)
print("health_failed",last,file=sys.stderr)
raise SystemExit(1)
