# Product Images Module

## Scope
This module currently provides the `AI First Frame` workflow under the `Product Images` section in Workbench.

## Navigation
- Sidebar level-1 entry: `Product Images`
- Sidebar level-2 entries:
  - `AI Clothing Swap` (placeholder)
  - `AI First Frame` (implemented)
  - `AI Product Gallery` (placeholder)

## Implemented Flow (AI First Frame)
1. Upload 1 product image.
2. Configure generation parameters.
3. Generate 1/2/4 first-frame images.
4. Post-process result:
   - Rename download prefix
   - Download single image
   - Download all images
   - One-click apply to Workbench as first frame

## Workbench Handoff
The first-frame result writes payload to localStorage key:
- `vflow_apply_first_frame`

`Workbench.tsx` consumes this key when entering `workbench` view and injects the image as a product asset, preserving existing Workbench settings (model, duration, language, etc.).

## API Integration
Frontend service: `src/services/productImagesApi.ts`

Backend endpoint used:
- `POST /api/projects/generate_first_frame`
- Temp upload helper:
  - `POST /api/assets/temp-upload/`

Notes:
- Output count (1/2/4) is implemented by repeated first-frame generation calls.
- Backend now supports missing `project_id` by reusing latest user project or creating one.

## i18n
New UI text in this module is language-aware using `useLanguage()`:
- `zh` shows Chinese strings.
- Other languages currently fallback to English strings.

## Key Files
- `src/components/workbench/Sidebar.tsx`
- `src/components/workbench/ProductImagesView.tsx`
- `src/pages/Workbench.tsx`
- `src/components/productImages/Functions/FirstFrame/FirstFrameView.tsx`
- `src/components/productImages/Functions/FirstFrame/FirstFrameForm.tsx`
- `src/components/productImages/Functions/FirstFrame/FirstFrameResult.tsx`
- `src/services/productImagesApi.ts`
- `src/types/productImages.ts`
- `vflow-backend/projects/views.py`
