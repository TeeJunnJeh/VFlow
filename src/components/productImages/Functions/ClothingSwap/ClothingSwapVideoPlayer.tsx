import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';

interface ClothingSwapVideoPlayerProps {
  src: string;
  className?: string;
  videoClassName?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
}

export const ClothingSwapVideoPlayer: React.FC<ClothingSwapVideoPlayerProps> = ({
  src,
  className = '',
  videoClassName = '',
  autoPlay = false,
  loop = false,
  muted = true,
  preload = 'metadata',
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(muted);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.load();
    video.muted = muted;
    setIsMuted(muted);
    if (!autoPlay) {
      setIsPlaying(false);
      return;
    }
    void video.play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [autoPlay, muted, src]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const enterFullscreen = () => {
    const target = wrapperRef.current;
    if (!target || typeof target.requestFullscreen !== 'function') return;
    void target.requestFullscreen();
  };

  return (
    <div
      ref={wrapperRef}
      className={`group relative overflow-hidden bg-zinc-950 ${className}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <video
        ref={videoRef}
        src={src}
        className={`h-full w-full object-contain ${videoClassName}`}
        autoPlay={autoPlay}
        loop={loop}
        muted={isMuted}
        playsInline
        preload={preload}
        disablePictureInPicture
        disableRemotePlayback
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 py-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-zinc-100 transition hover:bg-white/10"
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-zinc-100 transition hover:bg-white/10"
            title={isMuted ? '取消静音' : '静音'}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={enterFullscreen}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-zinc-100 transition hover:bg-white/10"
          title="全屏"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};