#!/usr/bin/env python3
import random, subprocess, time

while True:                       # hit Ctrl-C to stop
    subprocess.run(["brightness", f"{random.random():.3f}"])
    time.sleep(4)
