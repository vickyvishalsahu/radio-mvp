"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import type { Quote } from "@/lib/types";
import {
  QUOTE_FADE_DURATION_MS,
  QUOTE_ROTATION_MIN_MS,
  QUOTE_ROTATION_MAX_MS,
} from "@/lib/constants";

type TQuoteRotatorProps = {
  quotes: Quote[];
};

const QuoteRotator = ({ quotes }: TQuoteRotatorProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const rotateQuote = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      setCurrentIndex((previousIndex) => {
        let next = Math.floor(Math.random() * quotes.length);
        while (next === previousIndex && quotes.length > 1) {
          next = Math.floor(Math.random() * quotes.length);
        }
        return next;
      });
      setIsVisible(true);
    }, QUOTE_FADE_DURATION_MS);
  }, [quotes.length]);

  useEffect(() => {
    const interval = setInterval(
      rotateQuote,
      QUOTE_ROTATION_MIN_MS + Math.random() * (QUOTE_ROTATION_MAX_MS - QUOTE_ROTATION_MIN_MS)
    );
    return () => clearInterval(interval);
  }, [rotateQuote]);

  const quote = quotes[currentIndex];
  if (!quote) return null;

  return (
    <div className="max-w-md px-6 text-center">

      <p
        className={cn(
          "font-display text-sm italic leading-relaxed text-white/40 transition-opacity duration-700 ease-in-out md:text-base",
          isVisible ? "opacity-100" : "opacity-0"
        )}
      >
        &ldquo;{quote.text}&rdquo;
      </p>
      <p
        className={cn(
          "mt-2 font-body text-xs text-white/25 transition-opacity duration-700 ease-in-out",
          isVisible ? "opacity-100" : "opacity-0"
        )}
      >
        — {quote.author}
      </p>
    </div>
  );
};

export default QuoteRotator;
