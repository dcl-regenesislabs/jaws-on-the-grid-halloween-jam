import json, struct, sys, collections

def gltf_json(path):
    with open(path, 'rb') as f:
        magic, _version, total = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67, 'not a GLB'
        while f.tell() < total:
            length, ctype = struct.unpack('<II', f.read(8))
            data = f.read(length)
            if ctype == 0x4E4F534A:
                return json.loads(data)
    raise ValueError('no JSON chunk')

for path in sys.argv[1:]:
    g = gltf_json(path)
    anims = g.get('animations', [])
    paths = collections.Counter(c['target']['path'] for a in anims for c in a['channels'])
    duration = max((g['accessors'][s['input']]['max'][0] for s in anims[0]['samplers']), default=0.0) if anims else 0.0
    print(f"{path}: animations={len(anims)} meshes={len(g.get('meshes', []))} "
          f"nodes={len(g.get('nodes', []))} skins={len(g.get('skins', []))} "
          f"channels={dict(paths)} duration={duration:.3f}s")
    assert len(anims) == 1,                 'must contain exactly one animation'
    assert len(g.get('meshes', [])) == 0,   'mesh leaked into the export'
    assert len(g.get('nodes', [])) == 63,   'expected Armature + 62 deform bones'
    assert paths['translation'] == paths['rotation'] == paths['scale'] == 62, 'every deform bone needs T/R/S channels'
    assert duration <= 10.0,                'max 10 s'
    assert path.lower().endswith('_emote.glb'), 'runtime requires the _emote.glb suffix'
    print('OK, duration expected', (int(__import__("os").environ.get("LOOPF","36")))/30)
