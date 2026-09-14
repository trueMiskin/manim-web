import type { Player, PlayerOptions } from '../player/Player';
import type { RecordingScene } from '../player/RecordingScene';
import type { Scene, SceneOptions } from '../core/Scene';
import type { Slide } from '../animation/MasterTimeline';

export interface SlideAppearance {
  title?: string;
  notes?: string;
  background?: string;
  backgroundImage?: string;
  backgroundFit?: 'contain' | 'cover';
  printPoster?: string;
  /** Trusted author-supplied HTML, used instead of the interactive content on paper. */
  printContent?: string;
}

export interface StaticSlide extends SlideAppearance {
  kind: 'html' | 'markdown' | 'image' | 'video' | 'audio' | 'blank';
  id: string;
  content: string;
  alt?: string;
  caption?: string;
  fit?: 'contain' | 'cover';
  poster?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
}

export interface SceneDefinition {
  build: (scene: RecordingScene) => Promise<void>;
  /** Return a fresh scene on every call; compilation and live playback are separate. */
  createScene?: (container: HTMLElement, options: SceneOptions) => Scene;
  options?: Omit<PlayerOptions, 'scene' | 'ui' | 'keyboard' | 'pointer' | 'ownsScene'>;
}

export interface SceneSlides extends SlideAppearance {
  kind: 'scene';
  id: string;
  load: () => Promise<SceneDefinition | { default: SceneDefinition }>;
}

export type PresentationSlide = StaticSlide | SceneSlides;

export interface PresentationTopic {
  id: string;
  title?: string;
  chapter?: string;
  slides: readonly PresentationSlide[];
}

export interface PresentationDefinition {
  title: string;
  topics: readonly PresentationTopic[];
  width?: number;
  height?: number;
  /** Default: all meaningful pauses. IDs use topic/scene/checkpoint. */
  handout?: 'all' | 'final' | readonly string[];
}

export type CheckpointSnapshot = Awaited<ReturnType<Player['captureCheckpoint']>>;

export interface CompiledScene {
  checkpoints: readonly Slide[];
  snapshots: Record<string, CheckpointSnapshot>;
}

export interface PresentationAssets {
  version: 1;
  title: string;
  width: number;
  height: number;
  scenes: Record<string, CompiledScene>;
}

/** Only public Reveal APIs; Reveal itself remains optional for core users. */
export interface RevealDeck {
  getRevealElement(): HTMLElement;
  getSlidesElement(): HTMLElement;
  getIndices(): { h: number; v?: number };
  getCurrentSlide(): HTMLElement;
  isReady(): boolean;
  isOverview(): boolean;
  configure(options: Record<string, unknown>): void;
  sync(): void;
  next(): void;
  on(event: string, listener: (event: RevealEvent) => void): void;
  off(event: string, listener: (event: RevealEvent) => void): void;
  addKeyBinding(
    binding: { keyCode: number; key: string; description: string },
    callback: () => void,
  ): void;
  removeKeyBinding(keyCode: number): void;
}

export interface RevealEvent {
  indexh?: number;
  indexv?: number;
  currentSlide?: HTMLElement;
}

export interface PresentationPluginOptions {
  /** Build-generated JSON or an already-loaded manifest. Dev mode compiles when omitted. */
  assets?: string | PresentationAssets;
  /** Show shared pause/replay/print controls. Default true. */
  controls?: boolean;
  /** Default false: returning from overview or a hidden tab leaves playback paused. */
  resumeAfterVisibility?: boolean;
  onError?: (error: unknown) => void;
}

export interface PresentationRoute {
  id: string;
  h: number;
  v: number;
  ordinal: number;
  topic: PresentationTopic;
  slide: PresentationSlide;
  checkpoint?: Slide;
  element: HTMLElement;
}
