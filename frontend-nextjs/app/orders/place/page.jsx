import { redirect } from "next/navigation";

export default function PlaceOrderRedirect() {
  redirect("/orders");
}
