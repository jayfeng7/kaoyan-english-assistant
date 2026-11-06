'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ImageRotation } from '@/lib/client/files';
export function ImageOrientationPicker({ file, disabled, onConfirm, onCancel }: {
  file: File; disabled: boolean; onConfirm: (rotation: ImageRotation) => void; onCancel: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [rotation, setRotation] = useState<ImageRotation>(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = preview;
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return <div className="space-y-3 rounded-xl border border-line bg-paper p-4">
    <p className="text-sm">确认图片文字朝上后再识别。旋转仅处理上传副本，原文件保持不变。</p>
    <div className="flex h-80 items-center justify-center overflow-hidden rounded-lg bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} alt="待识别图片方向预览" className="max-h-52 max-w-52 object-contain" style={{ transform: `rotate(${rotation}deg)` }} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed(true); }} />
    </div>
    {failed && <p role="alert" className="text-sm text-red-700">图片无法预览，请取消后重新选择有效图片。</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={disabled || !loaded} onClick={() => setRotation(((rotation + 270) % 360) as ImageRotation)}>向左旋转</Button>
      <Button variant="secondary" disabled={disabled || !loaded} onClick={() => setRotation(((rotation + 90) % 360) as ImageRotation)}>向右旋转</Button>
      <Button disabled={disabled || !loaded} onClick={() => onConfirm(rotation)}>方向正确，开始识别</Button>
      <Button variant="ghost" disabled={disabled} onClick={onCancel}>取消</Button>
    </div>
    <p role="status" className="text-xs text-muted">已顺时针旋转 {rotation}°；请检查正文方向，识别后仍需核对原文与完整性。</p>
  </div>;
}
