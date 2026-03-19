import { useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useWorkflowStore, type Workflow } from './workflowStore';

/**
 * Hook用于管理工作流与后端API的交互
 * 包括：
 * - 提交视频生成任务
 * - 轮询任务状态
 * - 自动更新工作流步骤
 * - 错误处理
 */

interface UseWorkflowAPIOptions {
  taskId?: string;
  projectId?: string;
  onError?: (error: any) => void;
  onSuccess?: (result: any) => void;
}

export const useWorkflowAPI = (options: UseWorkflowAPIOptions = {}) => {
  const { workflow, updateStep, completeStep, failStep, setStepProgress, advanceToNextStep } =
    useWorkflowStore();

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskIdRef = useRef<string | null>(options.taskId ?? null);

  /**
   * 提交视频生成任务到后端
   */
  const submitVideoGenerationTask = useCallback(
    async (payload: {
      prompt: string;
      project_id: string;
      image_path?: string;
      duration?: number;
      sound?: string;
      negative_prompt?: string;
    }) => {
      try {
        // Step 1: 标记信息采集完成
        completeStep('step_1', { input_payload: payload });

        // 模拟向后端提交
        const response = await axios.post('/api/projects/generate_video', payload);

        if (response.data.code === 0) {
          taskIdRef.current = response.data.data.task_id;

          // Step 2: 资源验证
          updateStep('step_2', {
            status: 'running',
            startedAt: new Date(),
            input: { payload },
          });

          // 模拟验证
          setTimeout(() => {
            completeStep('step_2', {
              validation_result: 'passed',
              cost: response.data.data.cost,
              balance: response.data.data.balance,
            });

            // Step 3: 提示词优化（可选，这里跳过）
            updateStep('step_3', {
              status: 'completed',
              startedAt: new Date(),
              completedAt: new Date(),
              output: { optimization_skipped: true },
            });

            // Step 4: 视频生成
            updateStep('step_4', {
              status: 'running',
              startedAt: new Date(),
            });

            // 开始轮询
            startPolling(response.data.data.task_id);
          }, 1000);
        } else {
          // 处理错误
          failStep('step_2', {
            code: 'VALIDATION_ERROR',
            message: response.data.message,
            details: response.data.data,
          });

          options.onError?.(response.data);
        }
      } catch (error: any) {
        failStep('step_2', {
          code: 'API_ERROR',
          message: error.message || '提交失败',
          details: error.response?.data,
        });
        options.onError?.(error);
      }
    },
    [completeStep, updateStep, failStep, options]
  );

  /**
   * 启动轮询获取任务状态
   */
  const startPolling = useCallback(
    (taskId: string) => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      const pollStatus = async () => {
        try {
          const response = await axios.get(`/api/tasks/${taskId}/status/`);

          if (response.data.code === 0) {
            const taskStatus = response.data.data;

            // 更新进度
            if (taskStatus.progress !== undefined) {
              setStepProgress('step_4', taskStatus.progress, taskStatus.estimated_remaining);
            }

            if (taskStatus.status === 'success' || taskStatus.status === 'completed') {
              // 完成视频生成
              completeStep('step_4', {
                video_url: taskStatus.video_url,
                cover_url: taskStatus.cover_url,
                duration: taskStatus.duration,
              });

              // Step 5: 结果保存
              updateStep('step_5', {
                status: 'running',
                startedAt: new Date(),
              });

              setTimeout(() => {
                completeStep('step_5', {
                  result_saved: true,
                  project_id: options.projectId,
                });

                // 工作流完成
                options.onSuccess?.(taskStatus);

                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current);
                }
              }, 1000);
            } else if (taskStatus.status === 'failed') {
              failStep('step_4', {
                code: taskStatus.error_code || 'GENERATION_FAILED',
                message: taskStatus.error_message || 'Video generation failed',
                details: taskStatus,
              });

              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
              }

              options.onError?.(taskStatus);
            }
          } else {
            throw new Error(response.data.message);
          }
        } catch (error: any) {
          failStep('step_4', {
            code: 'POLLING_ERROR',
            message: 'Failed to fetch task status',
            details: error.message,
          });

          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }

          options.onError?.(error);
        }
      };

      // 立即尝试一次
      void pollStatus();

      // 每2秒轮询一次
      pollingIntervalRef.current = setInterval(pollStatus, 2000);
    },
    [completeStep, failStep, setStepProgress, updateStep, options]
  );

  /**
   * 重试特定步骤
   */
  const retryStep = useCallback(
    (stepId: string, payload?: any) => {
      updateStep(stepId, {
        status: 'running',
        startedAt: new Date(),
        error: undefined,
      });

      if (stepId === 'step_4' && taskIdRef.current) {
        // 重新轮询
        startPolling(taskIdRef.current);
      }
    },
    [updateStep, startPolling]
  );

  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    workflow,
    submitVideoGenerationTask,
    startPolling,
    stopPolling,
    retryStep,
    taskId: taskIdRef.current,
  };
};
