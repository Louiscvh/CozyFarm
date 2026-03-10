interface ItemIconProps {
  icon: string
  alt: string
  className?: string
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]

function isImageIcon(icon: string): boolean {
  const lowerIcon = icon.toLowerCase()
  return icon.startsWith("/") || IMAGE_EXTENSIONS.some(ext => lowerIcon.endsWith(ext))
}

export function ItemIcon({ icon, alt, className = "inv-slot-icon" }: ItemIconProps) {
  if (isImageIcon(icon)) {
    return <img className={className} src={icon} alt={alt} draggable={false} />
  }

  return <span className={className}>{icon}</span>
}
