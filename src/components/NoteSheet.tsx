import { useEffect, useRef, useState } from 'react';
import { copyText } from '../plugins/sharer';
import { useStore } from '../store';
import type { TextNote } from '../types';
import { CopyIcon } from './icons';
import { Sheet } from './Sheet';

interface NoteSheetProps {
  open: boolean;
  /** 编辑已有文本；undefined = 新建 */
  note?: TextNote;
  onClose: () => void;
  onDelete: (note: TextNote) => void;
}

export function NoteSheet({ open, note, onClose, onDelete }: NoteSheetProps) {
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');

  // 抽屉常驻挂载（保住开关动画），每次打开时按目标文本重置
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setBody(note?.body ?? '');
      setMsg('');
    }
    wasOpen.current = open;
  }, [open, note]);

  const save = () => {
    if (!body.trim()) return;
    if (note) useStore.getState().updateNote(note.id, body);
    else useStore.getState().addNote(body);
    onClose();
  };

  // 复制的是编辑框里的当前内容：改了一半想拿走也顺手
  const doCopy = async () => {
    setMsg((await copyText(body)) ? '已复制到剪贴板' : '复制失败，请手动选中复制');
  };

  return (
    <Sheet open={open} title={note ? '文本' : '添加文本'} onClose={onClose}>
      <div className="form">
        <label className="form-row column">
          <span className="form-label">内容</span>
          <textarea
            className="form-textarea note-input"
            rows={12}
            autoComplete="off"
            placeholder="粘贴或输入要长期保存的文字"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setMsg('');
            }}
          />
        </label>

        <p className="settings-note">
          文本只存在本机，不参与分组与场景；会跟网页一起被搜索，也会一起进备份。
        </p>

        <button className="btn primary" disabled={!body.trim()} onClick={save}>
          {note ? '保存修改' : '添加'}
        </button>
        <button className="btn secondary" disabled={!body.trim()} onClick={() => void doCopy()}>
          <CopyIcon size={15} />
          复制
        </button>
        {note && (
          <button className="btn danger-ghost" onClick={() => onDelete(note)}>
            删除这条文本
          </button>
        )}
        {msg && <p className="settings-msg">{msg}</p>}
      </div>
    </Sheet>
  );
}
