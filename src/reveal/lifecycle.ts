import type { Player } from '../player/Player';
import { logger } from '../utils/logger';

interface MediaState {
  element: HTMLMediaElement;
  playing: boolean;
  time: number;
  rate: number;
}

/** Synchronous native print lifecycle; every print page already exists before this is installed. */
export class PrintLifecycle {
  private _player: Player | undefined;
  private _playing = false;
  private _media: MediaState[] = [];
  private _printing = false;

  constructor(
    private _activePlayer: () => Player | undefined,
    private _root: HTMLElement,
  ) {
    window.addEventListener('beforeprint', this._beforePrint);
    window.addEventListener('afterprint', this._afterPrint);
  }

  private _beforePrint = (): void => {
    if (this._printing) return;
    this._printing = true;
    this._player = this._activePlayer();
    this._playing = this._player?.isPlaying ?? false;
    this._player?.pause();
    this._media = Array.from(
      this._root.querySelectorAll<HTMLMediaElement>('audio, video'),
      (element) => ({
        element,
        playing: !element.paused,
        time: element.currentTime,
        rate: element.playbackRate,
      }),
    );
    this._media.forEach(({ element }) => element.pause());
  };

  private _afterPrint = (): void => {
    if (!this._printing) return;
    this._printing = false;
    if (this._playing && this._player === this._activePlayer()) this._player?.play();
    for (const { element, playing, time, rate } of this._media) {
      element.currentTime = time;
      element.playbackRate = rate;
      if (playing)
        void element
          .play()
          .catch((error: unknown) => logger.warn('Media did not resume after printing.', error));
    }
    this._media = [];
  };

  dispose(): void {
    window.removeEventListener('beforeprint', this._beforePrint);
    window.removeEventListener('afterprint', this._afterPrint);
    this._media = [];
  }
}
