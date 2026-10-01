import { useDelayedUnmount } from './Sheet';

export interface ActionItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  open: boolean;
  items: ActionItem[];
  onClose: () => void;
}

/** iOS 风格底部操作菜单 */
export function ActionSheet({ open, items, onClose }: ActionSheetProps) {
  const mounted = useDelayedUnmount(open, 260);
  if (!mounted) return null;
  return (
    <div className={`sheet-layer${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="action-sheet">
        <div className="action-group">
          {items.map((item) => (
            <button
              key={item.label}
              className={`action-item${item.destructive ? ' destructive' : ''}`}
              onClick={() => {
                onClose();
                item.onPress();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="action-group">
          <button className="action-item cancel" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '删除',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const mounted = useDelayedUnmount(open, 200);
  if (!mounted) return null;
  return (
    <div className={`modal-layer${open ? ' open' : ''}`}>
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="modal-card" role="alertdialog" aria-label={title}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="modal-btn" onClick={onCancel}>
            取消
          </button>
          <button className="modal-btn destructive" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
