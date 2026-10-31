"use client";

import { MotionConfig, motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 28, rotateX: 10 },
  show: { opacity: 1, y: 0, rotateX: 0, transition: { type: "spring", stiffness: 150, damping: 22 } },
};

/**
 * Children marked with <StaggerItem> drop in one after another, 0.1 s apart, tilting up from the
 * Z axis. Items that stream in later (Suspense) still animate on mount. Reduced motion: transforms
 * are skipped and only the fade remains.
 */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        variants={container}
        initial="hidden"
        animate="show"
        style={{ perspective: 1400 }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item} style={{ transformOrigin: "50% 100%" }}>
      {children}
    </motion.div>
  );
}
