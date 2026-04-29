declare module 'react-masonry-css' {
  import type { ReactNode, CSSProperties } from 'react';

  interface MasonryProps {
    breakpointCols?: number | { default: number; [key: number]: number };
    className?: string;
    columnClassName?: string;
    children?: ReactNode;
    style?: CSSProperties;
  }

  const Masonry: (props: MasonryProps) => JSX.Element;
  export default Masonry;
}
