type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  external?: boolean;
};

// Обычная ссылка-кнопка. Магнитный эффект убран ради «бюджета движения».
export default function Button({ href, children, variant = "primary", external }: Props) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`btn btn-${variant}`}
    >
      <span>{children}</span>
    </a>
  );
}
