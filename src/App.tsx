import React from 'react';
import { Box, Container, Flex, Text, Image } from '@chakra-ui/react';
import PresaleCard from './components/PresaleCard';
import './styles/Background.css';
import dogecatLogo from './assets/dogecatai.png';

function App() {
  return (
    <div className="dogecat-background">
      <Container maxW="container.lg" pt={0} pb={4} className="dogecat-content">
        <Flex direction="column" align="center" gap={0}>
          {/* Logo displayed directly on the background */}
          <Image 
            src={dogecatLogo} 
            alt="DOGECAT" 
            width="80%" 
            maxWidth="500px"
            height="auto" 
            objectFit="contain"
            className="floating"
            position="relative"
            zIndex={2}
            marginBottom="-30px"
          />
          
          {/* Main presale card */}
          <Box width="100%" position="relative" zIndex={1}>
            <PresaleCard />
          </Box>
          
          <Box mt={4} textAlign="center" bg="rgba(255, 255, 255, 0.6)" p={2} borderRadius="md">
            <Text fontSize="sm" color="gray.700">
              &copy; {new Date().getFullYear()} DOGECAT Token. All rights reserved.
            </Text>
          </Box>
        </Flex>
      </Container>
    </div>
  );
}

export default App;
