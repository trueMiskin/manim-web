"""Eight visual features and 17 checkpoints, matching the browser tech demo.

Run from this directory with ``uv run manim --renderer=cairo -ql main.py TechDemo``.
The demo reads the bundled fields and recorded transmitter trajectory.
"""

import json
from pathlib import Path

import manim as m
import numpy as np
from manim_slides import ThreeDSlide

ROOT = Path(__file__).resolve().parents[1]
CYAN = "#00FFFF"
GREEN = "#00E676"
AMBER = "#FFB300"
TEXT = "#F3F4F6"
MUTED = "#8996A6"
FIELD_SCALE = 1.4
FIELD_CENTER = np.array([0.0, -0.1, 0.0])
ROOM_VERTICES = np.array([
    [-3.5, -1.5, 0], [-3.5, 0.5, 0], [-2, 1.2, 0], [-2, 2.2, 0],
    [0.5, 2.2, 0], [3.5, 1.8, 0], [3.5, -0.6, 0], [1.5, -1.5, 0],
    [-3.5, -1.5, 0],
])


def label(value, position, size=26, color=TEXT):
    return m.Text(value, font_size=size, color=color).move_to(position)


def lens(concave=False, thickness=0.45):
    """Use the original demonstration's pair of curved lens faces."""
    if not concave:
        bottom, top = 1.5 * m.DOWN, 1.5 * m.UP
        parts = [
            m.ArcBetweenPoints(bottom, top, angle=thickness),
            m.ArcBetweenPoints(top, bottom, angle=thickness),
        ]
    else:
        top_left, top_right = [-0.55, 1.5, 0], [0.55, 1.5, 0]
        bottom_left, bottom_right = [-0.55, -1.5, 0], [0.55, -1.5, 0]
        parts = [
            m.Line(top_left, top_right),
            m.ArcBetweenPoints(top_right, bottom_right, angle=m.PI / 4),
            m.Line(bottom_right, bottom_left),
            m.ArcBetweenPoints(bottom_left, top_left, angle=m.PI / 4),
        ]
    return (
        m.VMobject()
        .set_points(np.concatenate([part.points for part in parts]))
        .set_fill(CYAN, opacity=0.25)
        .set_stroke(CYAN, width=2)
    )


def lens_rays(focus=3.0):
    return m.VGroup(*[
        m.VMobject()
        .set_points_as_corners([[-5, y, 0], [0, y, 0], [5, y * (1 - 5 / focus), 0]])
        .set_stroke(AMBER, width=2)
        .set_fill(opacity=0)
        for y in np.linspace(-0.8, 0.8, 7)
    ])


def room_ray_path(angle):
    """Trace a planar ray through four reflections, ending at its fifth wall hit."""
    origin = np.array([-2.8, -1.1, 0])
    direction = np.array([np.cos(angle), np.sin(angle), 0])
    points = [origin.copy()]
    for _ in range(5):
        nearest, hit, hit_edge = float("inf"), None, None
        for start, end in zip(ROOM_VERTICES[:-1], ROOM_VERTICES[1:]):
            edge = end - start
            denominator = np.cross(direction, edge)[2]
            if abs(denominator) < 1e-9:
                continue
            delta = start - origin
            distance = np.cross(delta, edge)[2] / denominator
            along_edge = np.cross(delta, direction)[2] / denominator
            if 1e-4 < distance < nearest and 0 <= along_edge <= 1:
                nearest, hit, hit_edge = distance, origin + distance * direction, edge
        if hit is None:
            break
        points.append(hit.copy())
        normal = np.cross([0, 0, 1], hit_edge)
        normal /= np.linalg.norm(normal)
        direction -= 2 * np.dot(direction, normal) * normal
        origin = hit
    return points


def reflected_path(tx, rx, wall_y=-1.75):
    virtual = tx.copy()
    virtual[1] = 2 * wall_y - tx[1]
    ratio = (wall_y - rx[1]) / (virtual[1] - rx[1])
    bounce = rx + ratio * (virtual - rx)
    path = m.VMobject().set_points_as_corners([tx, bounce, rx])
    return path.set_stroke(GREEN, width=4), virtual, bounce


def table():
    return m.RoundedRectangle(
        width=5, height=3.5, corner_radius=0.08,
        stroke_color="#8E9296", stroke_width=6,
        fill_color="#0D3B2E", fill_opacity=1,
    )


def field_point(value):
    point = np.zeros(3)
    point[:len(value)] = value
    return FIELD_SCALE * point + FIELD_CENTER


def heatmap(state):
    image = m.ImageMobject(str(ROOT / "data" / state["image"]))
    image.set_resampling_algorithm(m.RESAMPLING_ALGORITHMS["nearest"])
    image.stretch_to_fit_width(5 * FIELD_SCALE)
    image.stretch_to_fit_height(3.5 * FIELD_SCALE)
    return image.move_to(FIELD_CENTER).set_opacity(0.85).set_z_index(1)


def vector_field(state):
    # Retain all slots, including invisible arrows, for matching transforms.
    return m.VGroup(*[
        m.Arrow(
            field_point(arrow["start"]), field_point(arrow["end"]),
            buff=0, color=arrow["color"], stroke_width=2.5,
            max_tip_length_to_length_ratio=0.25,
        ).set_opacity(arrow["opacity"])
        for arrow in state["arrows"]
    ]).set_z_index(2)


def field_table():
    frame = table().scale(FIELD_SCALE).move_to(FIELD_CENTER)
    obstacle = m.Rectangle(
        width=1.2 * FIELD_SCALE, height=FIELD_SCALE,
        stroke_color="#30363D", fill_color="#22252A", fill_opacity=1,
    ).move_to(FIELD_CENTER)
    pockets = m.VGroup(*[
        m.Dot(field_point([x, y]), radius=0.12 * FIELD_SCALE, color="#000000")
        for x in [-2.5, 2.5] for y in [-1.75, 1.75]
    ]).set_z_index(4)
    return m.VGroup(frame, obstacle, pockets)


class TechDemo(ThreeDSlide):
    """A compact Manim counterpart to the 17-checkpoint TypeScript demo."""

    def construct(self):
        self.camera.background_color = "#000000"
        m.Text.set_default(color=TEXT)
        self.text_demo()
        self.optics_demo()
        self.formula_demo()
        self.reflections_demo()
        self.dynamic_demo()
        self.surface_demo()
        states = {
            state["id"]: state
            for state in json.loads((ROOT / "data/states.json").read_text())["states"]
        }
        self.fields_demo(states)
        self.optimization_demo(states)

    def start_topic(self, title, caption):
        self.clear()
        self.set_camera_orientation(phi=0, theta=-m.PI / 2)
        labels = (
            label(title, [0, 3.25, 0], size=34),
            label(caption, [0, -3.3, 0], size=19, color=MUTED),
        )
        self.add(*labels)
        return labels

    def text_demo(self):
        self.next_slide(notes="Text 1/2: write a title and a short caption.")
        title = label("Manim tech demo", [0, 1.25, 0], size=54)
        subtitle = label("Text, geometry and scientific animation", [0, 0.1, 0])
        abilities = label("Write · transform · animate · pause", [0, -0.75, 0], color=CYAN)
        self.play(m.Write(title), m.FadeIn(subtitle), m.FadeIn(abilities), run_time=1.4)

        self.next_slide(notes="Text 2/2: match text shapes and write a LaTeX formula.")
        phrase = label("Animated text", [0, 0.8, 0], size=48)
        next_phrase = label("Animated equations", [0, 0.8, 0], size=48)
        formula = m.MathTex(r"E(x)=\sum_{k=1}^{N}a_k e^{i\phi_k(x)}", color=CYAN)
        formula.move_to([0, -0.6, 0])
        self.play(m.FadeOut(title), m.FadeOut(subtitle), m.FadeOut(abilities), m.Write(phrase))
        self.play(m.TransformMatchingShapes(phrase, next_phrase), m.Write(formula))
        self.add(label("Text and LaTeX at each pause", [0, -2.1, 0], size=21, color=MUTED))
        self.wait(0.2)

    def optics_demo(self):
        self.next_slide(notes="Optics 1/3: draw a convex lens and a bundle of rays.")
        self.start_topic("Shape morphing", "A lens becomes a room; light keeps bouncing")
        shape, rays = lens(), lens_rays()
        self.play(m.Create(shape), m.Create(rays), run_time=1.5)

        self.next_slide(notes="Optics 2/3: change to a concave lens and pause on its diverging rays.")
        self.play(m.Transform(shape, lens(concave=True)),
                  m.Transform(rays, lens_rays(focus=-3)), run_time=1)
        self.next_slide(notes="Optics 3/3: morph the lens into a room and follow three bouncing rays.")
        room = m.VMobject().set_points_as_corners(ROOM_VERTICES)
        room.set_stroke(TEXT, width=2.5).set_fill("#161B22", opacity=0.4)
        self.play(m.Transform(shape, room, run_time=1.5), m.FadeOut(rays, run_time=0.5))
        paths = m.VGroup(*[
            m.VMobject().set_points_as_corners(room_ray_path(np.deg2rad(angle)))
            .set_stroke(color, width=2).set_fill(opacity=0)
            for angle, color in zip([18, 38, 65], [AMBER, CYAN, GREEN])
        ])
        self.play(m.Create(paths), run_time=1)
        pulses = [m.Dot(path.get_start(), radius=0.08, color=path.get_color()) for path in paths]
        self.add(*pulses)
        self.play(*(m.MoveAlongPath(pulse, path) for pulse, path in zip(pulses, paths)),
                  run_time=4, rate_func=m.linear)

    def formula_demo(self):
        self.next_slide(notes="Formulas 1/2: the incident and reflected angles match.")
        self.start_topic("Formula morphing", "Matching parts move as the ray changes")
        formula = m.MathTex(r"\theta_i", "=", r"\theta_r", font_size=40, color=CYAN)
        formula.move_to([-3.05, 0.55, 0])
        caption = label("Reflection", [-3.05, -1.2, 0], color=AMBER)
        center = np.array([3.2, -0.15, 0])
        medium = m.Rectangle(
            width=5.9, height=2.6, stroke_opacity=0,
            fill_color="#153948", fill_opacity=0.6,
        ).move_to([3.25, -1.45, 0])
        boundary = m.Line([0.3, -0.15, 0], [6.2, -0.15, 0], color=MUTED)
        normal = m.DashedLine([3.2, -2.55, 0], [3.2, 2.25, 0], color=MUTED)
        incident = m.Arrow([1.25, 1.8, 0], center, buff=0, color=CYAN)
        outgoing = m.Arrow(center, [5.15, 1.8, 0], buff=0, color=AMBER)
        incident_arc = m.Arc(
            radius=0.65, start_angle=m.PI / 2, angle=m.PI / 4,
            arc_center=center, color=CYAN,
        )
        outgoing_arc = m.Arc(
            radius=0.85, start_angle=m.PI / 4, angle=m.PI / 4,
            arc_center=center, color=AMBER,
        )
        incident_label = m.MathTex(r"\theta_i", font_size=28, color=CYAN)
        incident_label.move_to([2.75, 0.95, 0])
        outgoing_label = m.MathTex(r"\theta_r", font_size=28, color=AMBER)
        outgoing_label.move_to([3.65, 0.95, 0])
        self.add(medium, boundary, normal)
        self.play(m.Write(formula), m.FadeIn(caption), m.Create(incident),
                  m.Create(outgoing), m.Create(incident_arc), m.Create(outgoing_arc),
                  m.FadeIn(incident_label), m.FadeIn(outgoing_label))

        self.next_slide(notes="Formulas 2/2: match the shared symbols as the ray refracts.")
        next_formula = m.MathTex(
            r"n_1", r"\sin", r"\theta_i", "=", r"n_2", r"\sin", r"\theta_t",
            font_size=34, color=CYAN,
        ).move_to([-3.05, 0.55, 0])
        next_label = m.MathTex(r"\theta_t", font_size=28, color=AMBER)
        next_label.move_to([3.62, -1.3, 0])
        refracted = m.Arrow(center, [4.5, -2.58, 0], buff=0, color=AMBER)
        refracted_arc = m.Arc(
            radius=0.85, start_angle=-m.PI / 2,
            angle=np.arcsin(np.sin(m.PI / 4) / 1.5), arc_center=center, color=AMBER,
        )
        self.play(
            m.TransformMatchingTex(formula, next_formula, key_map={r"\theta_r": r"\theta_t"}),
            m.TransformMatchingTex(outgoing_label, next_label, key_map={r"\theta_r": r"\theta_t"}),
            m.Transform(caption, label("Refraction", [-3.05, -1.2, 0], color=AMBER)),
            m.Transform(outgoing, refracted), m.Transform(outgoing_arc, refracted_arc),
            medium.animate.set_fill("#153F36"), run_time=1.8,
        )

    def reflections_demo(self):
        self.next_slide(notes="Reflections 1/2: mirror a point and construct a bounce path.")
        self.start_topic("Geometry and paths", "Mirror a point, construct a path, follow it")
        tx, rx = np.array([-1.5, -0.595, 0]), np.array([2.5, 1.75, 0])
        path, virtual, bounce = reflected_path(tx, rx)
        ball = m.Dot(tx, color=TEXT, radius=0.1).set_z_index(4)
        pocket = m.Dot(rx, color=AMBER, radius=0.13)
        mirror = m.Dot(virtual, color=CYAN, radius=0.08)
        guide = m.DashedLine(rx, virtual, color=CYAN, stroke_width=2)
        self.play(m.FadeIn(table()), m.FadeIn(ball), m.FadeIn(pocket))
        self.play(m.TransformFromCopy(ball, mirror), m.Create(guide))
        self.play(m.Create(path), m.GrowFromCenter(m.Dot(bounce, color=AMBER)))

        self.next_slide(notes="Reflections 2/2: move the ball along the constructed path.")
        self.play(m.FadeOut(guide), m.FadeOut(mirror))
        self.play(m.MoveAlongPath(ball, path), run_time=2, rate_func=m.linear)

    def dynamic_demo(self):
        self.next_slide(notes="Dynamic 1/2: draw a path tied to a moving receiver.")
        self.start_topic("Live geometry updates", "Move the receiver; the bounce follows")
        tx = np.array([-1.5, -0.595, 0])
        receiver = m.Dot([2.5, 1.75, 0], color=AMBER, radius=0.13)
        path = m.always_redraw(lambda: reflected_path(tx, receiver.get_center())[0])
        self.play(m.FadeIn(table()), m.FadeIn(m.Dot(tx, radius=0.1)))
        self.play(m.FadeIn(receiver), m.Create(path))

        self.next_slide(notes="Dynamic 2/2: the receiver moves and the bounce is recalculated.")
        self.play(receiver.animate.shift(1.5 * m.LEFT), run_time=3, rate_func=m.linear)
        path.clear_updaters()

    def surface_demo(self):
        self.next_slide(notes="3D 1/2: reveal a flat grid in perspective.")
        labels = self.start_topic(
            "Deforming surfaces", "A flat grid becomes a travelling wave, then a saddle",
        )
        self.set_camera_orientation(phi=m.PI / 3, theta=-m.PI / 3)
        self.add_fixed_in_frame_mobjects(*labels)

        def surface(height):
            return m.Surface(
                lambda u, v: np.array([u, v, height(u, v)]),
                u_range=[-2.2, 2.2], v_range=[-2.2, 2.2], resolution=(24, 24),
                checkerboard_colors=[CYAN, "#176270"],
                fill_opacity=0.95, stroke_width=0.25,
            )

        grid = surface(lambda _u, _v: 0)
        grid.save_state()
        self.play(m.FadeIn(grid), run_time=1.2)

        self.next_slide(notes="3D 2/2: turn the travelling wave, then deform it into a saddle.")
        self.play(m.Transform(grid, surface(lambda u, v: 0.7 * np.sin(2 * u) * np.cos(2 * v))),
                  run_time=1.6)

        def travel(mob, alpha):
            mob.restore().apply_function(lambda point: np.array([
                point[0], point[1],
                0.7 * np.sin(2 * point[0] - m.TAU * alpha) * np.cos(2 * point[1]),
            ])).rotate(0.5 * alpha, axis=m.OUT, about_point=m.ORIGIN)

        self.play(m.UpdateFromAlphaFunc(grid, travel), run_time=2.4, rate_func=m.linear)
        saddle = surface(lambda u, v: 0.35 * (u ** 2 - v ** 2))
        saddle.rotate(0.5, axis=m.OUT, about_point=m.ORIGIN)
        self.play(m.Transform(grid, saddle), run_time=1.6)
        self.remove_fixed_in_frame_mobjects(*labels)

    def fields_demo(self, states):
        self.next_slide(notes="Fields 1/2: reveal order-one coverage and its gradient arrows.")
        self.start_topic("Heatmaps and vector fields", "Coverage, gradients and smooth transitions")
        initial = states["002-coverage"]
        image, vectors = heatmap(initial), vector_field(initial)
        self.add(field_table(),
                 m.Dot(field_point([-1.5, -0.595]), color=CYAN).set_z_index(4))
        self.play(m.FadeIn(image))
        self.play(m.LaggedStart(*(m.Create(arrow) for arrow in vectors), lag_ratio=0.002))

        self.next_slide(notes="Fields 2/2: smooth the same reflection order and sweep its sharpness.")
        smoothing = [state for key, state in states.items() if key.endswith("-smoothing")]
        for state in smoothing:
            next_image = heatmap(state)
            self.play(m.FadeOut(image), m.FadeIn(next_image),
                      m.Transform(vectors, vector_field(state)),
                      run_time=0.15, rate_func=m.linear)
            image = next_image

    def optimization_demo(self, states):
        self.next_slide(notes="Optimization 1/2: show the transmitter, receivers and starting field.")
        self.start_topic("Data-driven animation", "One trajectory drives the marker, trail and field")
        data = json.loads((ROOT / "data/optimization.json").read_text())
        initial = states[data["initialStateId"]]
        image = heatmap(initial)
        vectors = vector_field(initial)
        tx = m.Dot(field_point(data["initialTx"]), radius=0.12, color=CYAN).set_z_index(4)
        receivers = m.VGroup(*[
            m.Dot(field_point(point), radius=0.12, color=AMBER)
            for point in data["receivers"]
        ]).set_z_index(4)
        self.add(field_table())
        self.play(m.FadeIn(image), m.FadeIn(vectors), m.FadeIn(tx), m.FadeIn(receivers))

        self.next_slide(notes="Optimization 2/2: replay all 100 recorded transmitter updates.")
        points = [tx.get_center()]
        trail = m.VMobject(color=CYAN, stroke_width=3).set_z_index(3)
        self.add(trail)
        for step in data["steps"]:
            position = field_point(step["tx"])
            points.append(position)
            next_image = heatmap(states[step["stateId"]])
            next_trail = trail.copy().set_points_as_corners(points)
            self.play(m.FadeOut(image), m.FadeIn(next_image),
                      m.Transform(vectors, vector_field(states[step["stateId"]])),
                      tx.animate.move_to(position), m.Transform(trail, next_trail),
                      run_time=0.1, rate_func=m.linear)
            image = next_image
        self.wait(0.5)
