import MainApp from "./screens/MainApp";

// Demo component — bypasses auth for testing/demo purposes
export default function Demo() {
  const demoWaiter = {
    phone: "050-1234567",
    staffId: "demo-staff",
    restaurantId: "demo-rest",
    restaurantName: "סטודיו תל אביב",
    name: "נועה לוי",
    role: "מלצרית",
    accessRole: "waiter"
  };

  const handleSignOut = () => {
    window.location.reload();
  };

  return <MainApp waiter={demoWaiter} onSignOut={handleSignOut} />;
}
