import bpy, math, sys, os

# ------------------------------------------------------------------
# bake-brand.py  |  Mqhele Cele portfolio - stylized 3D brand marks
# Usage: blender --background --factory-startup assets/blend/bake-brand.py -- <outdir>
#
# Generates one .glb per platform brand. These are ORIGINAL, abstract,
# trademark-safe marks (rounded slabs, rings, sparks) evoking each
# platform's identity without copying any actual logo art.
# ------------------------------------------------------------------

argv = sys.argv[sys.argv.index('--') + 1:]
outdir = argv[0]
os.makedirs(outdir, exist_ok=True)

B = '#0866FF'   # meta blue
BO = '#5B9FFF'  # boosting light blue
GO = '#4285F4'  # google blue
LI = '#0A66C2'  # linkedin blue
TI = '#25F4EE'  # tiktok cyan

def hex_to_rgba(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)) + (1.0,)

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def set_bsdf(bsdf, names, value):
    for n in names:
        if n in bsdf.inputs:
            bsdf.inputs[n].default_value = value
            return

def make_material(name, color_hex, rough=0.16, metal=0.08, coat=0.7, coat_rough=0.10, emit=0.0, emit_color=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    set_bsdf(bsdf, ['Base Color'], hex_to_rgba(color_hex))
    set_bsdf(bsdf, ['Roughness'], rough)
    set_bsdf(bsdf, ['Metallic'], metal)
    set_bsdf(bsdf, ['Specular'], 0.6)
    set_bsdf(bsdf, ['Clearcoat', 'Coat Weight'], coat)
    set_bsdf(bsdf, ['Clearcoat Roughness', 'Coat Roughness'], coat_rough)
    if emit > 0:
        set_bsdf(bsdf, ['Emission Color'], hex_to_rgba(emit_color or color_hex))
        set_bsdf(bsdf, ['Emission Strength'], emit)
    return m

def select_only(objects):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0] if objects else None

def shade_smooth(objs):
    for o in objs:
        for f in o.data.polygons:
            f.use_smooth = True

def bevel_sub(o, width=0.18, segments=3, angle=35.0, subdiv=0):
    m = o.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    if subdiv > 0:
        s = o.modifiers.new('Subdiv', 'SUBSURF')
        s.levels = subdiv
        s.render_levels = subdiv
        s.quality = 1

def add_cube(size, scale, loc=(0, 0, 0), mat=None, bevel=None, smooth=True):
    bpy.ops.mesh.primitive_cube_add(size=size, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        bevel_sub(o, **bevel)
    if mat:
        o.data.materials.append(mat)
    if smooth:
        shade_smooth([o])
    return o

def add_torus(major, minor, loc=(0, 0, 0), mat=None, smooth=True, maj_seg=28, min_seg=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=maj_seg, minor_segments=min_seg, location=loc)
    o = bpy.context.object
    if mat:
        o.data.materials.append(mat)
    if smooth:
        shade_smooth([o])
    return o

def add_sphere(radius, loc=(0, 0, 0), mat=None, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=24, ring_count=12, location=loc)
    o = bpy.context.object
    if mat:
        o.data.materials.append(mat)
    if smooth:
        shade_smooth([o])
    return o

def add_box_burst(loc, w, d, h, mat, gap):
    o = add_cube(1, (w, d, h), loc=loc, mat=mat,
                 bevel={'width': min(w, d) * 0.22, 'segments': 3})
    return o

def normalize_scale(objs, target=1.6):
    select_only(objs)
    if objs:
        bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_VOLUME', center='BOUNDS')
    dims = [max(o.dimensions) for o in objs if o.dimensions]
    biggest = max(dims)
    k = target / biggest if biggest else 1.0
    for o in objs:
        o.scale = (o.scale[0] * k, o.scale[1] * k, o.scale[2] * k)
        o.select_set(False)
    select_only(objs)
    bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_VOLUME', center='BOUNDS')
    for o in objs:
        o.select_set(False)

def export_glb(filename, objs):
    select_only(objs)
    tris = sum(len(o.data.loop_triangles) for o in objs if o.type == 'MESH')
    print(f'TRIS {filename}: {tris}')
    fp = os.path.join(outdir, filename)
    bpy.ops.export_scene.gltf(
        filepath=fp,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
    print(f'EXPORTED {fp}')

# ---------------------------------------------------------------- meta
def build_meta():
    M = make_material('meta_body', B, coat=0.75, emit=0.18)
    ring_m = make_material('meta_ring', B, rough=0.10, metal=0.35, emit=0.5)
    orb_m = make_material('meta_orb', B, rough=0.05, metal=0.1, emit=0.9)
    objs = []
    objs.append(add_cube(1, (1.0, 1.0, 0.20), mat=M, bevel={'width': 0.24, 'segments': 4}))
    ring = add_torus(0.32, 0.075, loc=(0, 0, 0.30), mat=ring_m)
    ring.rotation_euler = (math.radians(18), math.radians(0), math.radians(35))
    objs.append(ring)
    orb = add_sphere(0.09, loc=(0.32, 0.05, 0.62), mat=orb_m)
    objs.append(orb)
    normalize_scale(objs)
    export_glb('meta.glb', objs)

# -------------------------------------------------------------- boosting
def build_boosting():
    body_m = make_material('boost_body', BO, rough=0.14, metal=0.2, coat=0.8, emit=0.35)
    edge_m = make_material('boost_edge', BO, rough=0.10, metal=0.5, emit=0.9)
    objs = []
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.9, radius2=0.001, depth=1.6, location=(0, 0, 0))
    top = bpy.context.object
    top.data.materials.append(body_m)
    shade_smooth([top])

    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.9, radius2=0.001, depth=1.6, location=(0, 0, 0))
    bottom = bpy.context.object
    bottom.rotation_euler = (math.radians(180), 0, 0)
    bottom.data.materials.append(body_m)
    shade_smooth([bottom])
    objs.extend([top, bottom])

    ring = add_torus(0.62, 0.045, loc=(0, 0, 0), mat=edge_m)
    ring.rotation_euler = (math.radians(72), 0, 0)
    objs.append(ring)
    normalize_scale(objs)
    export_glb('boosting.glb', objs)

# ----------------------------------------------------------------- google
def build_google():
    lens_m = make_material('google_lens', GO, rough=0.08, metal=0.15, coat=0.9, emit=0.4)
    handle_m = make_material('google_handle', GO, rough=0.18, metal=0.1, coat=0.8, emit=0.2)
    glass_m = make_material('google_glass', GO, rough=0.02, metal=0.0, coat=1.0, emit=0.1)
    objs = []
    ring = add_torus(0.48, 0.10, loc=(0, 0, 0.05), mat=lens_m)
    objs.append(ring)
    lens = add_sphere(0.40, loc=(0, 0, 0.06), mat=glass_m)
    lens.scale = (1, 1, 0.42)
    objs.append(lens)
    handle = add_cube(1, (0.30, 0.08, 0.34), loc=(0, -0.86, -0.12), mat=handle_m,
                      bevel={'width': 0.10, 'segments': 3})
    handle.rotation_euler = (0, math.radians(38), 0)
    objs.append(handle)
    normalize_scale(objs)
    export_glb('google.glb', objs)

# --------------------------------------------------------------- linkedin
def build_linkedin():
    slab_m = make_material('li_slab', LI, rough=0.16, metal=0.08, coat=0.75, emit=0.3)
    dot_m = make_material('li_dot', LI, rough=0.06, metal=0.2, emit=0.95)
    objs = []
    slab = add_cube(1, (1.1, 1.1, 0.24), mat=slab_m, bevel={'width': 0.26, 'segments': 4})
    objs.append(slab)
    bar = add_cube(1, (0.10, 0.52, 0.30), loc=(0.20, 0.0, 0.27), mat=dot_m,
                   bevel={'width': 0.05, 'segments': 3})
    objs.append(bar)
    dot = add_sphere(0.10, loc=(-0.30, -0.30, 0.40), mat=dot_m)
    objs.append(dot)
    normalize_scale(objs)
    export_glb('linkedin.glb', objs)

# ---------------------------------------------------------------- tiktok
def build_tiktok():
    beat_m = make_material('tk_beat', TI, rough=0.12, metal=0.35, coat=0.85, emit=0.75)
    objs = []
    for off, x, y in [(0, -0.55, 0.70), (1, -0.20, 0.05), (2, 0.50, -0.70)]:
        o = add_cube(1, (0.90, 0.34, 0.34), loc=(x, y, 0.0), mat=beat_m,
                     bevel={'width': 0.16, 'segments': 3})
        o.rotation_euler = (0, 0, math.radians(8 * (off - 1)))
        objs.append(o)
    pulse = add_torus(0.26, 0.05, loc=(0.85, 0.15, 0.10), mat=beat_m)
    pulse.rotation_euler = (math.radians(80), 0, math.radians(-10))
    objs.append(pulse)
    normalize_scale(objs, target=1.7)
    export_glb('tiktok.glb', objs)

build_meta()
clean_scene()
build_boosting()
clean_scene()
build_google()
clean_scene()
build_linkedin()
clean_scene()
build_tiktok()
print('DONE')
