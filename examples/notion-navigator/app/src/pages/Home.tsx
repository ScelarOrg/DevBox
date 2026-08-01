import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home(): JSX.Element {
  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center justify-center px-6 py-24">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Your app is running</CardTitle>
          <CardDescription>
            coss UI components are ready — describe what you want in the chat and
            Scelar will build it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button>Get started</Button>
        </CardContent>
      </Card>
    </section>
  );
}
