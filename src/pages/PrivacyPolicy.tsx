import { Link } from 'react-router-dom';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import privacyPolicyContent from '../../privacy_policy.md?raw';
import { setMetaDescription } from '../utils/seo';

const PrivacyPolicyPage = () => {
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'VFLOW AI - 隐私政策 - GenViewTech';
    setMetaDescription(
      'Learn how VFLOW AI collects, uses, and protects your data. This Privacy Policy explains information we store, cookies, security measures, and your rights.'
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg md:text-xl font-semibold">Privacy Policy</h1>
          <Link to="/" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <article className="prose prose-invert prose-zinc max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-200 prose-li:text-zinc-200 prose-strong:text-zinc-100 prose-a:text-orange-400 hover:prose-a:text-orange-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{privacyPolicyContent}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
};

export default PrivacyPolicyPage;
