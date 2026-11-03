import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Heading, Text } from '@mucsi96/react-ui';
import { fetchJson, greetingSchema } from './api';
import { LoadingGreeting } from './LoadingGreeting';

export default function Home() {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['greeting'], queryFn: ({ signal }) => fetchJson('/api/greeting', greetingSchema, { signal }),
  });
  if (isPending) return <LoadingGreeting />;
  if (error) return <Alert tone="error">
    Unable to load greeting. <Button onPress={() => void refetch()}>Try again</Button>
  </Alert>;
  return <>
    <Heading level={1}>Welcome, {data.name}</Heading>
    <Text muted>{data.message}</Text>
    <Card className="greeting"><Text>{data.aiGreeting}</Text></Card>
  </>;
}
