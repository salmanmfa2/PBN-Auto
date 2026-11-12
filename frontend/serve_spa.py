import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class SPARequestHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        requested_path = urlsplit(self.path).path
        filesystem_path = Path(self.translate_path(requested_path))
        if not filesystem_path.exists() and not Path(requested_path).suffix:
            original_path = self.path
            self.path = "/index.html"
            try:
                return super().send_head()
            finally:
                self.path = original_path
        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description="Serve a built single-page application.")
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    directory = args.directory.resolve()
    if not (directory / "index.html").is_file():
        parser.error(f"No index.html found in {directory}")

    handler = partial(SPARequestHandler, directory=str(directory))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Serving {directory} on http://{args.bind}:{server.server_port}")
        server.serve_forever()


if __name__ == "__main__":
    main()
