// How much of a lesson's width its story takes (the rest is the code), dragged by the divider between them and
// kept for next time. It lives with the lesson, so dragging re-renders only the lesson.
import { useEffect, useState } from 'react';
import { load, save } from '../store.js';

export default function useStoryWidth() {
  const [storyW, setStoryW] = useState(() => {
    const w = load('bento.storyW', 0.47);
    return w === 0.4 ? 0.47 : w; // 0.4 was the old default
  });
  useEffect(() => save('bento.storyW', storyW), [storyW]);
  const dragStory = (e) => {
    e.preventDefault();
    const main = e.currentTarget.parentElement.getBoundingClientRect();
    const move = (ev) =>
      setStoryW(Math.min(0.6, Math.max(0.26, (ev.clientX - main.left) / main.width)));
    const up = () => {
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  };
  return { storyW, dragStory };
}
