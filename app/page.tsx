import { redirect } from "next/navigation";

/**
 * The public address is printed/encoded on venue NFC cards and QR material.
 * Send that audience directly to play; hosts keep using /host or /login.
 */
export default function Home() {
  redirect("/join");
}
