/**
 * 图片上传组件 - 支持拖拽和点击上传
 */

import React, { useCallback, useState, useRef } from 'react';
import { Upload, X, Check } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

interface ImageUploaderProps {
  maxFiles?: number;
  maxFileSize?: number; // bytes, default 5MB
  acceptedFormats?: string[];
  onFilesSelected: (files: File[]) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  multiple?: boolean;
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
}) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

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
          `${file.name}: ${tr('不支持的格式，仅支持 JPG/PNG/WebP', 'Unsupported format. Only JPG/PNG/WebP are allowed')}`
        );
        continue;
      }

      // 检查大小
      if (file.size > maxFileSize) {
        errors.push(
          `${file.name}: ${tr('文件过大，最大', 'File is too large, max')} ${Math.ceil(maxFileSize / 1024 / 1024)}MB`
        );
        continue;
      }

      valid.push(file);
    }

    // 检查文件数量
    if (valid.length + selectedFiles.length > maxFiles) {
      errors.push(
        `${tr('最多只能上传', 'Maximum upload count is')} ${maxFiles} ${tr('张图片', 'image(s)')}`
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

  /**
   * 处理文件选择
   */
  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const { valid, errors } = validateFiles(fileArray);

      if (errors.length > 0) {
        onError(errors[0]);
        return;
      }

      const newSelectedFiles = [...selectedFiles, ...valid];
      setSelectedFiles(newSelectedFiles);

      // 生成新预览
      const newPreviews = await generatePreviews(valid);
      setPreviews([...previews, ...newPreviews]);

      // 通知父组件
      onFilesSelected(newSelectedFiles);

      // 重置input
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [selectedFiles, previews, onFilesSelected, onError, maxFiles, maxFileSize, acceptedFormats]
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
    const newPreviews = previews.filter((_, i) => i !== index);

    setSelectedFiles(newFiles);
    setPreviews(newPreviews);
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

  return (
    <div className="w-full">
      {/* 上传区 */}
      {selectedFiles.length < maxFiles && (
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
          <input
            ref={inputRef}
            type="file"
            multiple={multiple && maxFiles > 1}
            accept={acceptedFormats.join(',')}
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center">
            <Upload className="w-8 h-8 text-orange-500 mb-3" />
            <p className="text-zinc-100 font-medium mb-1">
              {tr('上传图片', 'Upload Image')}
              {maxFiles > 1 && ` (${selectedFiles.length}/${maxFiles})`}
            </p>
            <p className="text-zinc-400 text-sm">
              {tr('拖拽图片或点击选择', 'Drag files here or click to select')}
            </p>
            <p className="text-zinc-500 text-xs mt-3">
              {tr('支持 JPG, PNG, WebP • 最大', 'Supports JPG, PNG, WebP • Max')} {Math.ceil(maxFileSize / 1024 / 1024)}MB
            </p>
          </div>
        </div>
      )}

      {/* 预览列表 */}
      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <p className="text-zinc-300 text-sm font-medium mb-3">{tr('已上传图片', 'Uploaded Images')}</p>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {previews.map((preview, index) => (
              <div
                key={index}
                className="relative group"
              >
                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-700">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* 悬停时显示操作 */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
                      title={tr('删除', 'Delete')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <span className="text-white text-xs">
                      {selectedFiles[index].name}
                    </span>
                  </div>
                </div>

                {/* 文件大小 */}
                <p className="text-zinc-500 text-xs mt-1">
                  {(selectedFiles[index].size / 1024).toFixed(0)} KB
                </p>
              </div>
            ))}
          </div>

          {/* 确认/继续按钮 */}
          {selectedFiles.length > 0 && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  if (inputRef.current) {
                    inputRef.current.click();
                  }
                }}
                disabled={disabled || selectedFiles.length >= maxFiles}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {selectedFiles.length < maxFiles ? tr('+ 添加更多', '+ Add more') : tr('已达到上限', 'Max reached')}
              </button>
              <button
                disabled={disabled || selectedFiles.length === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {tr('确认上传', 'Confirm Upload')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
