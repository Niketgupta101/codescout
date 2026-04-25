export const formatName = ({ firstName, lastName }: { firstName: string; lastName: string }) => {
  return `${firstName} ${lastName}`.trim();
};
