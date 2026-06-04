export interface Task {
  id: string;
  name: string;
  completions: string[]; // 'YYYY-MM-DD' strings
  createdAt: string;
}

export type RootStackParamList = {
  Home: undefined;
  TaskDetail: { taskId: string };
};
