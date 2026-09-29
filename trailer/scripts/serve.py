"""Static server for the preview that never lets the browser cache, so a reload always shows the latest edit.

Usage: python3 scripts/serve.py [port]
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    handler = functools.partial(NoCacheHandler, directory=root)
    http.server.ThreadingHTTPServer(("0.0.0.0", port), handler).serve_forever()
