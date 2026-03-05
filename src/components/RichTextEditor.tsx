import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef } from 'react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}

export default function RichTextEditor({ content, onChange, placeholder = 'Write something...' }: RichTextEditorProps) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
        code: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
  })

  // Sync external content changes (only if content truly differs)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <div>
      {/* Toolbar */}
      <div
        className="flex gap-1 p-1.5 rounded-t-[10px] border border-b-0"
        style={{
          backgroundColor: 'var(--bg-page)',
          borderColor: 'var(--border-card)',
        }}
      >
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        >
          <em>I</em>
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div
        className="rounded-b-[10px] border p-3"
        style={{
          backgroundColor: 'var(--input-bg)',
          borderColor: 'var(--border-card)',
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors duration-100 cursor-pointer"
      style={{
        backgroundColor: active ? 'var(--accent)' : 'transparent',
        color: active ? 'white' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  )
}
