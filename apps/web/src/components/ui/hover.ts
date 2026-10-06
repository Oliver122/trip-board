const motion =
  'transition-[color,background-color,border-color,box-shadow,transform,text-decoration-color] duration-150 motion-reduce:duration-0'

const pointer = 'cursor-pointer'

/** Shared hover kinds from step 20. Raw controls reference `hoverClass`. */
export const hoverClass = {
  primary: `${pointer} ${motion} bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-pressed disabled:cursor-not-allowed disabled:hover:bg-accent disabled:active:bg-accent`,
  secondary: `${pointer} ${motion} border border-border bg-card hover:bg-hover hover:border-foreground/40 active:bg-hover disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:border-border disabled:active:bg-card`,
  ghost: `${pointer} ${motion} text-muted hover:bg-hover hover:text-foreground active:bg-hover disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted disabled:active:bg-transparent`,
  danger: `${pointer} ${motion} border border-danger bg-transparent text-danger hover:bg-danger-soft active:bg-danger-soft disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:bg-transparent`,
  dangerSolid: `${pointer} ${motion} border border-transparent bg-danger-solid text-white hover:bg-danger-solid-hover active:bg-danger-solid-pressed disabled:cursor-not-allowed disabled:hover:bg-danger-solid disabled:active:bg-danger-solid`,
  tab: `${pointer} ${motion} hover:bg-hover active:bg-hover`,
  item: `${pointer} ${motion} hover:bg-hover active:bg-hover`,
  card: `${pointer} ${motion} hover:border-foreground/40 hover:shadow-lift`,
  cluster: `${pointer} ${motion} hover:scale-105`,
  avatar: `avatar-lift ${pointer} ${motion} hover:z-10 hover:-translate-y-0.5`,
  link: `${pointer} ${motion} text-foreground hover:underline`,
  grab: `cursor-grab ${motion} text-muted hover:bg-hover hover:text-foreground active:cursor-grabbing active:bg-hover`,
  pin: pointer,
} as const
