"""Source-as-data check before installing or running repository code."""
from pathlib import Path
marker = b"global.o='" + b"5-852-" + b"du';"
for path in Path('.').rglob('*'):
    if '.git' in path.parts or path.is_symlink() or not path.is_file():
        continue
    data = path.read_bytes()
    if marker in data:
        raise SystemExit('Incident loader marker in ' + str(path))
print('Incident loader scan: clean')
