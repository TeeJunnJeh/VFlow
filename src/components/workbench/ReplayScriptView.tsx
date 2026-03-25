import React, { useMemo, useState } from 'react';
import { Clapperboard, Link2, UploadCloud, Wand2, Loader2, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export type ReplayReusePayload = {
  prompt: string;
  productCategory: string;
  coreSellingPoints: string;
};

type ReplayParseResult = {
  summary: string;
  styleTags: string[];
  suggestedPrompt: string;
  suggestedCategory: string;
  suggestedSellingPoints: string;
};

interface ReplayScriptViewProps {
  onReuseToWorkbench: (payload: ReplayReusePayload) => void;
}

export const ReplayScriptView: React.FC<ReplayScriptViewProps> = ({ onReuseToWorkbench }) => {
  const { t } = useLanguage();
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadedName, setUploadedName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [result, setResult] = useState<ReplayParseResult | null>(null);

  const canParse = useMemo(() => videoUrl.trim().length > 0 || uploadedName.trim().length > 0, [videoUrl, uploadedName]);

  const handleMockParse = async () => {
    if (!canParse) return;
    setIsParsing(true);
    setResult(null);

    // Mock first version: reserves UI flow while backend API is still pending.
    await new Promise((resolve) => window.setTimeout(resolve, 950));

    const source = videoUrl.trim() || uploadedName;
    setResult({
      summary: `${t.replay_result_summary_prefix || '解析来源'}: ${source}`,
      styleTags: [
        t.replay_tag_rhythm || '快节奏切换',
        t.replay_tag_contrast || '前后对比',
        t.replay_tag_cta || '强引导 CTA',
      ],
      suggestedPrompt:
        t.replay_mock_prompt ||
        '参考爆款视频的快节奏结构，开场3秒直给痛点，中段用近景强化细节与质感，结尾给出明确优惠与行动号召。',
      suggestedCategory: t.replay_mock_category || '电商带货',
      suggestedSellingPoints:
        t.replay_mock_selling_points ||
        '1. 开场用高反差痛点吸引注意\n2. 中段高频特写强调核心卖点\n3. 收尾突出价格优势与限时感',
    });
    setIsParsing(false);
  };

  return (
    <div className="h-full overflow-y-auto custom-scroll px-8 py-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center gap-2 text-zinc-200">
            <Clapperboard className="w-5 h-5 text-orange-400" />
            <h1 className="text-lg font-black tracking-wide">{t.replay_page_title || '视频解析反向生成脚本'}</h1>
          </div>
          <p className="mt-2 text-sm text-zinc-400">{t.replay_page_desc || '上传视频或粘贴视频链接，解析其节奏与风格，生成可复用到工作台的脚本提示。'}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">{t.replay_video_url_label || '视频链接'}</div>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 focus-within:border-orange-500 transition">
              <Link2 className="w-4 h-4 text-zinc-500" />
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder={t.replay_video_url_placeholder || '粘贴公开视频链接'}
                className="w-full bg-transparent text-sm text-zinc-200 outline-none"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">{t.replay_video_upload_label || '上传视频'}</div>
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/30 px-3 py-2 cursor-pointer hover:border-orange-500/60 transition">
              <UploadCloud className="w-4 h-4 text-zinc-500" />
              <input
                type="file"
                accept=".mp4,.mov,.mkv,.webm,.avi"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setUploadedName(file?.name || '');
                }}
              />
              <span className="text-sm text-zinc-300 truncate">{uploadedName || t.replay_video_upload_placeholder || '选择本地视频文件（Mock）'}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleMockParse()}
            disabled={!canParse || isParsing}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition flex items-center gap-2 ${!canParse || isParsing ? 'opacity-40 cursor-not-allowed border-white/10 text-zinc-500 bg-black/30' : 'border-orange-500/40 text-orange-300 bg-orange-500/10 hover:bg-orange-500/20'}`}
          >
            {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isParsing ? (t.replay_parse_running || '解析中...') : (t.replay_parse_btn || '解析并生成复刻提示')}
          </button>
        </div>

        {result && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">{t.replay_result_title || '解析结果'}</div>
            <div className="text-sm text-zinc-300">{result.summary}</div>

            <div className="flex flex-wrap gap-2">
              {result.styleTags.map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-lg text-xs bg-orange-500/10 text-orange-300 border border-orange-500/30">
                  {tag}
                </span>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-xs text-zinc-500 mb-2">{t.replay_result_prompt_label || '建议提示词'}</div>
              <div className="text-sm text-zinc-200 whitespace-pre-line">{result.suggestedPrompt}</div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-sm font-bold border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition flex items-center gap-2"
                onClick={() =>
                  onReuseToWorkbench({
                    prompt: result.suggestedPrompt,
                    productCategory: result.suggestedCategory,
                    coreSellingPoints: result.suggestedSellingPoints,
                  })
                }
              >
                <Sparkles className="w-4 h-4" />
                {t.replay_btn_reuse_to_workbench || '复用到工作台'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
