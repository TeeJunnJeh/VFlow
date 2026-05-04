import { Link } from 'react-router-dom';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import termsContent from '../../terms_of_service.md?raw';
import { setMetaDescription } from '../utils/seo';

const TermsOfServicePage = () => {
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'VFLOW AI - 服务条款';
    setMetaDescription(
      'Read VFLOW AI Terms of Service covering usage rules, payments, refunds, intellectual property, acceptable content, and account responsibilities for all users.'
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg md:text-xl font-semibold">Terms of Service</h1>
          <Link to="/" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <article className="prose prose-invert prose-zinc max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-200 prose-li:text-zinc-200 prose-strong:text-zinc-100 prose-a:text-orange-400 hover:prose-a:text-orange-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{termsContent}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
};

export default TermsOfServicePage;
