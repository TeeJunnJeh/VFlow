import React, { useMemo } from 'react';

const STAR_COUNT = 50;

interface StarParticle {
  id: number;
  left: string;
  top: string;
  size: string;
  duration: string;
  delay: string;
}

const generateStars = (): StarParticle[] =>
  Array.from({ length: STAR_COUNT }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: `${Math.random() * 2.5 + 1}px`,
    duration: `${Math.random() * 3 + 2.5}s`,
    delay: `${Math.random() * 4}s`,
  }));

export const DynamicInteractiveBackground: React.FC = () => {
  const stars = useMemo(() => generateStars(), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Floating gradient orbs */}
      <div className="int-orb int-orb--1" />
      <div className="int-orb int-orb--2" />
      <div className="int-orb int-orb--3" />
      <div className="int-orb int-orb--4" />

      {/* Starfield particles */}
      <div className="int-starfield">
        {stars.map((s) => (
          <div
            key={s.id}
            className="int-particle"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animation: `int-particle-twinkle ${s.duration} ease-in-out ${s.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* Subtle shimmer sweep */}
      <div className="int-shimmer-overlay" />
    </div>
  );
};
