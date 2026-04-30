/**
 * 图片上传组件 - 支持拖拽和点击上传
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

interface ImageUploaderProps {
  maxFiles?: number;
  maxFileSize?: number; // bytes, default 5MB
  acceptedFormats?: string[];
  onFilesSelected: (files: File[]) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  multiple?: boolean;
  previewVariant?: 'default' | 'first-frame';
  value?: File[];
}

const DEFAULT_ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  maxFiles = 1,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedFormats = DEFAULT_ACCEPTED_FORMATS,
  onFilesSelected,
  onError,
  disabled = false,
  multiple = true,
  previewVariant = 'default',
  value,
}) => {
  const { t } = useLanguage();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [previewingIndex, setPreviewingIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!Array.isArray(value)) return;
    setSelectedFiles(value);
  }, [value]);

  /**
   * 验证文件
   */
  const validateFiles = (files: File[]): { valid: File[]; errors: string[] } => {
    const errors: string[] = [];
    const valid: File[] = [];

    for (const file of files) {
      // 检查格式
      if (!acceptedFormats.includes(file.type)) {
        errors.push(
          `${file.name}: ${t.ff_upload_error_format}`
        );
        continue;
      }

      // 检查大小
      if (file.size > maxFileSize) {
        errors.push(
          `${file.name}: ${t.ff_upload_error_too_large} ${Math.ceil(maxFileSize / 1024 / 1024)}MB`
        );
        continue;
      }

      valid.push(file);
    }

    // 检查文件数量
    if (valid.length + selectedFiles.length > maxFiles) {
      errors.push(
        `${t.ff_upload_error_max_count} ${maxFiles} ${t.ff_upload_image_unit}`
      );
      return { valid: [], errors };
    }

    return { valid, errors };
  };

  /**
   * 生成预览
   */
  const generatePreviews = (files: File[]): Promise<string[]> => {
    return Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              resolve((e.target?.result as string) || '');
            };
            reader.readAsDataURL(file);
          })
      )
    );
  };

  useEffect(() => {
    let alive = true;
    if (selectedFiles.length === 0) {
      setPreviews([]);
      return () => {
        alive = false;
      };
    }
    setPreviews([]);
    void generatePreviews(selectedFiles).then((nextPreviews) => {
      if (alive) setPreviews(nextPreviews);
    });
    return () => {
      alive = false;
    };
  }, [selectedFiles]);

  /**
   * 处理文件选择
   */
  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const { valid, errors } = validateFiles(fileArray);

      if (errors.length > 0) {
        onError(errors[0]);
        return;
      }

      const newSelectedFiles = [...selectedFiles, ...valid];
      setSelectedFiles(newSelectedFiles);

      // 通知父组件
      onFilesSelected(newSelectedFiles);

      // 重置input
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [selectedFiles, onFilesSelected, onError, maxFiles, maxFileSize, acceptedFormats]
  );

  /**
   * 拖拽处理
   */
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) return;
      handleFileSelect(e.dataTransfer.files);
    },
    [disabled, handleFileSelect]
  );

  /**
   * 移除文件
   */
  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);

    setPreviewingIndex((current) => (current === null || current === index ? null : current > index ? current - 1 : current));
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  /**
   * 点击上传
   */
  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const previewingFile = previewingIndex !== null ? selectedFiles[previewingIndex] || null : null;
  const previewingImage = previewingIndex !== null ? previews[previewingIndex] || '' : '';
  const showFirstFrameLargeSlot = previewVariant === 'first-frame' && selectedFiles.length === 0;
  const showFirstFrameGrid = previewVariant === 'first-frame' && selectedFiles.length > 0;
  const canAddMoreFiles = selectedFiles.length < maxFiles;

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        multiple={multiple && maxFiles > 1}
        accept={acceptedFormats.join(',')}
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={disabled}
        className="hidden"
      />

      {/* 上传区 */}
      {(showFirstFrameLargeSlot || (previewVariant !== 'first-frame' && selectedFiles.length < maxFiles)) && (
        <div
          className={`
            relative w-full border-2 border-dashed rounded-lg p-8
            transition-all duration-200 cursor-pointer
            ${
              disabled
                ? 'border-zinc-600 bg-zinc-800 cursor-not-allowed opacity-60'
                : dragActive
                  ? 'border-orange-500 bg-orange-500/5'
                  : 'border-zinc-600 bg-zinc-900 hover:border-orange-500/50'
            }
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <div className="flex flex-col items-center justify-center">
            <Upload className="w-8 h-8 text-orange-500 mb-3" />
            <p className="text-zinc-100 font-medium mb-1">
              {previewVariant === 'first-frame'
                ? (((t as any).ff_upload_title_range_1_4 as string) || '上传1~4张图片')
                : (
                  <>
                    {t.ff_upload_title}
                    {maxFiles > 1 && ` (${selectedFiles.length}/${maxFiles})`}
                  </>
                )}
            </p>
            <p className="text-zinc-400 text-sm">
              {t.ff_upload_drag_or_click}
            </p>
            <p className="text-zinc-500 text-xs mt-3">
              {t.ff_upload_supports} {Math.ceil(maxFileSize / 1024 / 1024)}MB
            </p>
          </div>
        </div>
      )}

      {showFirstFrameGrid && (
        <div className="mt-6">
          <div className="grid grid-cols-2 gap-4">
            {selectedFiles.slice(0, maxFiles).map((file, index) => (
              <div key={`${file.name}-${index}`} className="relative group">
                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-zinc-900">
                  {previews[index] ? (
                    <img
                      src={previews[index]}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover cursor-zoom-in"
                      onClick={() => setPreviewingIndex(index)}
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-zinc-800" />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(index);
                      }}
                      className="pointer-events-auto absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white transition hover:bg-black/85"
                      title={t.ff_delete}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 p-2">
                      <p className="truncate text-xs font-medium !text-white">
                        {file.name}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {canAddMoreFiles && (
              <button
                type="button"
                onClick={handleClick}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`
                  flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200
                  ${
                    disabled
                      ? 'border-zinc-600 bg-zinc-800 cursor-not-allowed opacity-60'
                      : dragActive
                        ? 'border-orange-500 bg-orange-500/5'
                        : 'border-zinc-600 bg-zinc-900 hover:border-orange-500/50'
                  }
                `}
                aria-label={t.ff_upload_title}
              >
                <Upload className="h-6 w-6 text-orange-500" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 预览列表 */}
      {previewVariant !== 'first-frame' && selectedFiles.length > 0 && (
        <div className="mt-6">
          <p className="text-zinc-300 text-sm font-medium mb-3">{t.ff_uploaded_images}</p>
          <div className={maxFiles === 1 ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
            {selectedFiles.map((file, index) => {
              const preview = previews[index] || '';
              return (
              <div
                key={`${file.name}-${index}`}
                className="relative group"
              >
                <div className="relative w-full max-w-[250px] aspect-square rounded-lg overflow-hidden bg-zinc-900">
                  {preview ? (
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-zinc-800" />
                  )}

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
                      title={t.ff_delete}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <span className="text-white text-xs">
                      {file.name}
                    </span>
                  </div>
                </div>

                {/* 文件大小 */}
                <p className="text-zinc-500 text-xs mt-1">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            );
            })}
          </div>

        </div>
      )}

      {previewVariant === 'first-frame' && previewingFile && previewingImage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewingIndex(null)}
        >
          <div className="relative max-h-screen max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewingImage}
              alt={previewingFile.name}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/55 px-4 py-3 text-sm text-white">
              {previewingFile.name}
            </div>
            <button
              type="button"
              onClick={() => setPreviewingIndex(null)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
