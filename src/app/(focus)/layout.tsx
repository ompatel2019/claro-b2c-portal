import { FlashcardPersistDrain } from "@/components/flashcard-persist-drain";
export default function FocusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FlashcardPersistDrain />
      {children}
    </>
  );
}
