"""Minimal local mock server for validating the public result page.

This is a development harness, not the production API.

It is intentionally small; v27 browser regression checks can use the production HTML/JS
and this fixture to validate the public-result rendering path without requiring a live backend.
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api":
            query = parse_qs(parsed.query)
            if query.get("action", [""])[0] == "result-access":
                data = {
                    "result": {
                        "quizTitle": "UTME MOCK: COMMERCE",
                        "score": 82,
                        "total": 100,
                        "subjectScores": [
                            {"name": "Mathematics", "score": 98, "total": 100},
                            {"name": "Use of English", "score": 72, "total": 100},
                            {"name": "Physics", "score": 76, "total": 100},
                            {"name": "Chemistry", "score": 80, "total": 100}
                        ],
                        "percent": 82,
                        "pass_mark": 50,
                        "rank": 2,
                        "settings": {"reviewEnabled": False, "leaderboardEnabled": True},
                        "corrections": [],
                        "leaderboard": [
                            {"rank": 1, "name": "Michelle", "score": 90, "total": 100, "percent": 90, "timeUsed": 390},
                            {"rank": 2, "name": "Ola Obafemi success", "score": 82, "total": 100, "percent": 82, "timeUsed": 420},
                            {"rank": 3, "name": "Palmer", "score": 78, "total": 100, "percent": 78, "timeUsed": 488},
                            {"rank": 4, "name": "Okoye Kingsley", "score": 67, "total": 100, "percent": 67, "timeUsed": 510},
                            {"rank": 5, "name": "DNA", "score": 63, "total": 100, "percent": 63, "timeUsed": 530},
                            {"rank": 6, "name": "Musauddeen shukr othman ase", "score": 60, "total": 100, "percent": 60, "timeUsed": 540},
                            {"rank": 7, "name": "Deborah", "score": 57, "total": 100, "percent": 57, "timeUsed": 560},
                        ],
                    }
                }
                body = json.dumps(data).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        return super().do_GET()

    def log_message(self, *_args):
        pass


def main():
    root = Path(__file__).resolve().parent
    os.chdir(root)
    port = int(os.environ.get("PORT", "8123"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Mock Gifted Brainz server running on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
