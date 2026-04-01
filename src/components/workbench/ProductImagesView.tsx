import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Upload, X } from 'lucide-react';
import type { ViewType } from './types';
import { useLanguage } from '../../context/LanguageContext';
import { DropdownSelect } from '../common/DropdownSelect';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { FirstFrameView, SmartRepairView } from '../productImages';

interface ProductImagesViewProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

const ProductImagesView: React.FC<ProductImagesViewProps> = ({ activeView, setActiveView }) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);

  const productViews: { value: ViewType; label: string }[] = useMemo(
    () => [
      { value: 'product_images_clothing_swap', label: tr('AI 换装', 'AI Clothing Swap') },
      { value: 'product_images_first_frame', label: tr('AI 首帧图', 'AI First Frame') },
      { value: 'product_images_smart_repair', label: tr('智能修复', 'Smart Repair') },
      { value: 'product_images_gallery', label: tr('商品套图', 'Product Gallery') },
    ],
    [isZh]
  );

  const isProductView =
    activeView === 'product_images_clothing_swap' ||
    activeView === 'product_images_first_frame' ||
    activeView === 'product_images_smart_repair' ||
    activeView === 'product_images_gallery';

  const currentValue: ViewType = isProductView ? activeView : 'product_images_first_frame';

  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [galleryProductName, setGalleryProductName] = useState('');
  const [galleryCategory, setGalleryCategory] = useState('');
  const [gallerySellingPoints, setGallerySellingPoints] = useState<string[]>([]);
  const [galleryTargetScene, setGalleryTargetScene] = useState<'detail' | 'xiaohongshu' | 'douyin' | 'poster' | 'ads'>('detail');
  const [galleryStyle, setGalleryStyle] = useState<'ecom_clean' | 'lifestyle' | 'premium' | 'festival'>('ecom_clean');
  const [galleryOutputTypes, setGalleryOutputTypes] = useState<Record<'white_bg' | 'scene' | 'selling_point' | 'cover' | 'poster', boolean>>({
    white_bg: true,
    scene: false,
    selling_point: false,
    cover: false,
    poster: false,
  });
  const [galleryOutputCount, setGalleryOutputCount] = useState<4 | 6 | 9>(4);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPreviewUrls, setGalleryPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = galleryImages.map((f) => URL.createObjectURL(f));
    setGalleryPreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [galleryImages]);

  return (
    <div className="flex flex-col h-full z-10">
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {tr('商品图片生成', 'Product Image Generation')}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <div className="w-56">
            <DropdownSelect
              value={currentValue}
              options={productViews}
              onChange={(v) => setActiveView(v as ViewType)}
              buttonClassName="w-full bg-zinc-900/70 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              iconClassName="w-4 h-4 text-zinc-500"
              optionClassName="text-xs"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-10 py-6">
        {currentValue === 'product_images_clothing_swap' && (
          <div className="rounded-2xl border border-white/5 bg-white/2 h-full flex items-center justify-center text-zinc-500">
            <div>{tr('AI 换装（开发中）', 'AI Clothing Swap (In Development)')}</div>
          </div>
        )}

        {currentValue === 'product_images_first_frame' && (
          <FirstFrameView
            embedded
            onApplyToWorkbench={() => setActiveView('workbench')}
          />
        )}

        {currentValue === 'product_images_smart_repair' && (
          <SmartRepairView embedded />
        )}

        {currentValue === 'product_images_gallery' && (
          <div className="h-full flex gap-6">
            <div className="w-[46%] min-w-[420px] max-w-[640px] flex flex-col gap-4">
              <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-zinc-200">{tr('输入区', 'Input')}</div>
                  <button
                    type="button"
                    onClick={() => galleryFileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900/70 border border-white/10 text-zinc-200 hover:bg-zinc-800 transition flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {tr('上传商品图', 'Upload Product Images')}
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">商品图（必填 1~3 张）</div>
                  <input
                    ref={galleryFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
                      if (files.length === 0) return;
                      setGalleryImages((prev) => [...prev, ...files].slice(0, 3));
                      e.target.value = '';
                    }}
                  />

                  {galleryImages.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => galleryFileInputRef.current?.click()}
                      className="mt-3 w-full rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition"
                    >
                      <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <div className="text-sm font-semibold">点击上传 1~3 张商品图</div>
                      <div className="text-[11px] mt-1">支持 JPG / PNG / WEBP</div>
                    </button>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {galleryPreviewUrls.map((url, idx) => (
                        <div key={url} className="relative rounded-xl overflow-hidden border border-white/10 bg-black/30 aspect-square">
                          <img src={url} className="w-full h-full object-cover" alt={`product-${idx}`} />
                          <button
                            type="button"
                            onClick={() => setGalleryImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-zinc-200 hover:text-white hover:bg-black/80 transition flex items-center justify-center"
                            title="移除"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {galleryImages.length < 3 && (
                        <button
                          type="button"
                          onClick={() => galleryFileInputRef.current?.click()}
                          className="rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition flex items-center justify-center aspect-square"
                          title="添加图片"
                        >
                          <Plus className="w-6 h-6" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                <div className="text-sm font-bold text-zinc-200">可选信息</div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">商品名称（选填）</div>
                    <input
                      value={galleryProductName}
                      onChange={(e) => setGalleryProductName(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      placeholder="例如：便携榨汁杯"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">商品类目（选填）</div>
                    <input
                      value={galleryCategory}
                      onChange={(e) => setGalleryCategory(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                      placeholder="例如：小家电 / 美妆 / 食品"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">核心卖点（选填 2~5 条）</div>
                      <button
                        type="button"
                        onClick={() => setGallerySellingPoints((prev) => (prev.length >= 5 ? prev : [...prev, '']))}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-60"
                        disabled={gallerySellingPoints.length >= 5}
                      >
                        + 添加
                      </button>
                    </div>
                    {gallerySellingPoints.length === 0 ? (
                      <div className="text-xs text-zinc-600">未填写</div>
                    ) : (
                      <div className="space-y-2">
                        {gallerySellingPoints.map((val, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              value={val}
                              onChange={(e) => setGallerySellingPoints((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20"
                              placeholder={`卖点 ${idx + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => setGallerySellingPoints((prev) => prev.filter((_, i) => i !== idx))}
                              className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 flex items-center justify-center"
                              title="移除"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">目标场景</div>
                      <DropdownSelect
                        value={galleryTargetScene}
                        options={[
                          { value: 'detail', label: '详情页' },
                          { value: 'xiaohongshu', label: '小红书' },
                          { value: 'douyin', label: '抖音' },
                          { value: 'poster', label: '海报' },
                          { value: 'ads', label: '广告投流' },
                        ]}
                        onChange={(v) => setGalleryTargetScene(v as any)}
                        buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                        iconClassName="w-4 h-4 text-zinc-500"
                        optionClassName="text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">风格</div>
                      <DropdownSelect
                        value={galleryStyle}
                        options={[
                          { value: 'ecom_clean', label: '简洁电商风' },
                          { value: 'lifestyle', label: '生活方式风' },
                          { value: 'premium', label: '高级质感风' },
                          { value: 'festival', label: '节日营销风' },
                        ]}
                        onChange={(v) => setGalleryStyle(v as any)}
                        buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                        iconClassName="w-4 h-4 text-zinc-500"
                        optionClassName="text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">输出套图类型</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['white_bg', '白底图'],
                        ['scene', '场景图'],
                        ['selling_point', '卖点图'],
                        ['cover', '封面图'],
                        ['poster', '海报图'],
                      ] as Array<[keyof typeof galleryOutputTypes, string]>).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-200 cursor-pointer hover:bg-white/5">
                          <input
                            type="checkbox"
                            checked={galleryOutputTypes[key]}
                            onChange={(e) => setGalleryOutputTypes((prev) => ({ ...prev, [key]: e.target.checked }))}
                            className="accent-orange-500"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">输出数量</div>
                      <DropdownSelect
                        value={String(galleryOutputCount)}
                        options={[
                          { value: '4', label: '4 张' },
                          { value: '6', label: '6 张' },
                          { value: '9', label: '9 张' },
                        ]}
                        onChange={(v) => setGalleryOutputCount((Number(v) === 6 ? 6 : Number(v) === 9 ? 9 : 4) as any)}
                        buttonClassName="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                        iconClassName="w-4 h-4 text-zinc-500"
                        optionClassName="text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0 rounded-2xl border border-white/5 bg-white/2 p-5 flex flex-col">
              <div className="text-sm font-bold text-zinc-200">{tr('预览区', 'Preview')}</div>
              <div className="flex-1 mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 flex items-center justify-center text-zinc-500">
                {tr('输出预览（占位）', 'Output Preview (Placeholder)')}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProductImagesView;