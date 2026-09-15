import { Mobject } from '../core/Mobject';

/** Authored visibility is separate from opacity, so hidden content retains its style. */
export class SlideVisibility {
  private readonly authored = new Map<Mobject, { visible: boolean; opacity: number }>();

  hide(object: Mobject): void {
    this.visit(object, (child) => {
      this.authored.set(child, { visible: child.getThreeObject().visible, opacity: child.opacity });
      child.getThreeObject().visible = false;
    });
  }

  /** Expose a newly animated subtree without exposing its unrevealed siblings. */
  animate(object: Mobject): void {
    if (!this.authored.has(object)) return;
    if (!object.getThreeObject().visible) this.reveal(object);
  }

  /** Restore a requested subtree and only the ancestor path needed to display it. */
  reveal(object: Mobject, restoreOpacity = false): Mobject {
    this.visit(object, (child) => {
      child.getThreeObject().visible = this.authored.get(child)?.visible ?? true;
      if (restoreOpacity) this.restoreOpacity(child);
    });
    let root = object;
    let node: Mobject | null = object;
    while (node) {
      node.getThreeObject().visible = true;
      if (restoreOpacity) this.restoreOpacity(node);
      root = node;
      node = node.parent;
    }
    return root;
  }

  private restoreOpacity(object: Mobject): void {
    const state = this.authored.get(object);
    // Bypass group propagation so a translucent child keeps its own opacity.
    if (state) Mobject.prototype.setStrokeOpacity.call(object, state.opacity);
  }

  private visit(object: Mobject, visit: (object: Mobject) => void): void {
    visit(object);
    object.children.forEach((child) => this.visit(child, visit));
  }
}
