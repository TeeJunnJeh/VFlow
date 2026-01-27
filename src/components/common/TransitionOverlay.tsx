import { motion } from 'framer-motion';

const TransitionOverlay = () => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden"
        >
            {/* 1. 背景柔和提亮层 */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                className="absolute inset-0 bg-violet-600/10 backdrop-blur-sm"
            />

            {/* 2. 主扩散核心：多重滤镜叠加 */}
            <motion.div
                initial={{ scale: 0, opacity: 0, filter: "blur(40px)" }}
                animate={{
                    scale: 4,
                    opacity: [0, 1, 0.8],
                    filter: "blur(20px)",
                    transition: {
                        duration: 0.6,
                        ease: [0.22, 1, 0.36, 1], // Expo Out 曲线，极其平滑
                    }
                }}
                className="relative w-64 h-64 rounded-full bg-gradient-to-tr from-violet-600/80 via-pink-500/80 to-orange-400/80 mix-blend-screen shadow-[0_0_100px_rgba(139,92,246,0.5)]"
            />

            {/* 3. 极速白色闪光：增加瞬间的“穿梭”冲击感 */}
            <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                    scale: 6,
                    opacity: [0, 0.4, 0],
                    transition: { duration: 0.4, ease: "easeOut" }
                }}
                className="absolute w-32 h-32 rounded-full bg-white blur-3xl"
            />
        </motion.div>
    );
};

export default TransitionOverlay;