'use client';

import Image from 'next/image';

interface MemoryImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  loading?: 'lazy' | 'eager';
  onClick?: () => void;
}

function shouldFallbackToImg(src: string): boolean {
  return (
    src.startsWith('data:image') ||
    src.startsWith('blob:') ||
    /\.(heic|heif)(?:$|[?#])/i.test(src)
  );
}

export default function MemoryImage({
  src,
  alt,
  width,
  height,
  className,
  sizes,
  priority = false,
  loading = 'lazy',
  onClick,
}: MemoryImageProps) {
  if (shouldFallbackToImg(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : loading}
        decoding="async"
        className={className}
        onClick={onClick}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : loading}
      className={className}
      onClick={onClick}
    />
  );
}
