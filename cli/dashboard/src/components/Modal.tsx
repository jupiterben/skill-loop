import { Modal as AntModal } from "antd";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: Props) {
  return (
    <AntModal
      open={open}
      title={title}
      onCancel={onClose}
      footer={null}
      centered
      destroyOnHidden
      width={420}
    >
      {children}
    </AntModal>
  );
}
