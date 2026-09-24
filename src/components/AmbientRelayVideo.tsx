"use client";

import { useEffect, useRef } from "react";

export function AmbientRelayVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!video) return;

    const syncPlayback = () => {
      if (motion.matches) {
        video.pause();
        video.currentTime = 0;
        return;
      }
      void video.play().catch(() => {
        // The poster remains visible when a browser blocks autoplay.
      });
    };

    syncPlayback();
    motion.addEventListener("change", syncPlayback);
    return () => motion.removeEventListener("change", syncPlayback);
  }, []);

  return (
    <div className="loom-relay-media" aria-hidden="true">
      <video
        ref={videoRef}
        autoPlay
        disablePictureInPicture
        loop
        muted
        playsInline
        poster="/media/loom-relay-poster.jpg"
        preload="metadata"
        tabIndex={-1}
      >
        <source src="/media/loom-relay-loop.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
