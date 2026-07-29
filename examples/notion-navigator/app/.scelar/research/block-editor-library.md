web_search unavailable (402 credit limit). Proceeding on prior knowledge.

Editor library decision: BlockNote (@blocknote/core + @blocknote/react + @blocknote/mantine — though we can skip mantine styling and use our own). It is a ProseMirror-based Notion-style editor that ships:
- Block-based rich text editing with paragraphs, headings (h1-h3), bullet/numbered/todo lists, toggles, quotes, code blocks, callouts, images.
- Built-in SlashMenu (/) for inserting blocks.
- Built-in DragHandleButton + side menu for drag-and-drop block reordering.
- Custom block schema/inline content support; `getDefaultSlashMenuItems`, `BlockNoteView`, `useCreateBlockNote`.
- HTML & Markdown serialization (blocksToHTMLLossy / blocksToMarkdownLossy) for persistence.

Risks: Bundle size, Mantine dependency optional (we can style via CSS targeting .bn-* classes and pass theme tokens). Must integrate thinly first (mount BlockNoteView in a page) then deepen with persistence (JSON block schema stored in DB) and custom slash items.

Storage model: store each Notion page's block tree as a JSON column (BlockNote's Block[]) in Drizzle (text column holding JSON string). On load parse; on edit serialize. This matches the notes/[id] API pattern.

Alternative considered: TipTap directly — more flexible but we'd build slash menu + drag handles from scratch; too much for scope. BlockNote is the right pick.
