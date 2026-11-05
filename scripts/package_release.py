#!/usr/bin/env python3
"""Build a static-site ZIP and a source/verification handoff ZIP without credentials."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]

def zip_bytes(files):
    buffer = io.BytesIO()
    with ZipFile(buffer, 'w', ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    result = buffer.getvalue()
    with ZipFile(io.BytesIO(result)) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('ZIP integrity check failed')
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts')
    args = parser.parse_args()
    names = json.loads((ROOT / 'release-files.json').read_text())
    if len(names) != 22 or len(set(names)) != len(names) or 'index.html' not in names:
        raise ValueError('Expected the reviewed 22-file web release allowlist')
    web = {}
    for name in names:
        if Path(name).name != name:
            raise ValueError('Release paths must be top-level file names')
        web[name] = (ROOT / name).read_bytes()
    deployment = zip_bytes(web)
    try:
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        revision, dirty = None, None
    manifest = {
        'formatVersion': 1, 'sourceCommit': revision, 'workingTreeDirty': dirty,
        'note': 'File hashes identify the packaged content; sourceCommit alone is insufficient if dirty.',
        'deploymentSha256': hashlib.sha256(deployment).hexdigest(),
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(web.items())}
    }
    manifest_data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    handoff = dict(web)
    for name in ['README.md', 'database.rules.json', 'firebase.json', 'release-files.json', '.gitignore']:
        handoff[name] = (ROOT / name).read_bytes()
    for directory in ['tests', 'scripts', 'handoff']:
        for file in (ROOT / directory).rglob('*'):
            if file.is_file() and '__pycache__' not in file.parts:
                handoff[file.relative_to(ROOT).as_posix()] = file.read_bytes()
    handoff['deployment/soongong-deploy.zip'] = deployment
    handoff['deployment/manifest.json'] = manifest_data
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'soongong-deploy.zip').write_bytes(deployment)
    (args.output / 'soongong-handoff.zip').write_bytes(zip_bytes(handoff))
    (args.output / 'manifest.json').write_bytes(manifest_data)
    print(f'Web files: {len(web)}; handoff files: {len(handoff)}')
    print(f'Deployment SHA-256: {manifest["deploymentSha256"]}')
    print(f'Output: {args.output.resolve()}')

if __name__ == '__main__':
    main()
