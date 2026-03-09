// Re-exports from the Zustand-based editorStore.
// All existing imports  `from '../../store/useEditorStore'`  continue to work unchanged.

export {
  EditorStoreProvider,
  useEditorActions,
  shallow,
} from './editorStore'

import { useEditorStore as _raw } from './editorStore'

// useEditorStore() — returns { state } object for backwards compatibility.
// Also supports selector form: useEditorStore(s => s.nodes)
export function useEditorStore(selector) {
  if (typeof selector === 'function') {
    return _raw(selector)
  }
  // Legacy usage: const { state } = useEditorStore()
  const state = _raw()
  return { state }
}
