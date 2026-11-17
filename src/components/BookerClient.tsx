"use client";

import dynamic from "next/dynamic";

/** The Booker reads the visitor's timezone and saved details, so it renders in the browser only. */
const BookerClient = dynamic(() => import("./Booker"), {
  ssr: false,
  loading: () => <div className="h-[32rem] animate-pulse rounded-2xl border border-stone-200 bg-white" aria-label="Loading booking calendar" />,
});

export default BookerClient;
