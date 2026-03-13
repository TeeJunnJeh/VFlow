// src/services/supabase.ts
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL; // 从环境变量中读取
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY; // 从环境变量中读取
export const supabase = createClient(supabaseUrl, supabaseKey);

// 上传文件函数
export async function uploadFile(file: File): Promise<string | null> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `public/${fileName}`;

  const { error } = await supabase.storage
    .from('uploads') // 替换为你的 bucket 名称
    .upload(filePath, file);

  if (error) {
    console.error('上传失败:', error.message);
    return null;
  }

  const { data: publicUrlData } = supabase.storage
    .from('uploads')
    .getPublicUrl(filePath);

  return publicUrlData?.publicUrl || null;
}